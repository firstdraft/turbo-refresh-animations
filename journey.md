# Building Real-Time Todo Lists with Turbo Refresh Animations

This document chronicles our journey implementing a real-time collaborative todo list using Rails 8's Turbo Refresh with CSS class-based animations. What seemed like a straightforward feature revealed subtle interactions between Turbo's various mechanisms.

## The Goal

Build a todo app where:
- Multiple users can collaborate on the same list in real-time
- Items animate smoothly on create, update, and delete
- When one user adds an item, all connected clients see it appear with animation
- Users typing in forms shouldn't lose their input when others make changes
- Validation errors display nicely inline

## The Tech Stack

- **Rails 8.1** with Turbo (Hotwire)
- **Bootstrap 5** for styling
- **CSS class-based animations** (simpler than View Transitions API)
- **Action Cable** for WebSocket broadcasts

## Important: Turbo and HTTP Status Codes

Before diving in, a critical note about status codes. Turbo overrides browser defaults for form handling:

**For validation errors**, return `422 Unprocessable Entity`:
```ruby
render :new, status: :unprocessable_entity
```

**For redirects after non-GET requests**, use `303 See Other`:
```ruby
redirect_to @list, status: :see_other
```

Why 303? With a 302 redirect, browsers might follow the redirect using the *original* HTTP method. After a DELETE request, this could cause issues. The 303 status guarantees the redirect is followed with GET.

---

## Step 1: Basic Turbo Refresh (Real-Time Updates)

### Implementation

The simplest approach: use `broadcasts_refreshes_to` on the model and subscribe in the view.

```ruby
# app/models/item.rb
class Item < ApplicationRecord
  belongs_to :list
  broadcasts_refreshes_to :list
end
```

```erb
<%# app/views/lists/show.html.erb %>
<%= turbo_stream_from @list %>

<%= render "items/form", list: @list, item: @item %>

<div id="items">
  <% @list.items.each do |item| %>
    <%= render "items/item", item: item %>
  <% end %>
</div>
```

Enable morphing in the layout:
```erb
<%# app/views/layouts/application.html.erb %>
<%= turbo_refreshes_with method: :morph, scroll: :preserve %>
```

### How It Works

1. User submits the form
2. Item is saved to the database
3. Model callback broadcasts a "refresh" action to the list's stream
4. All subscribed clients receive the broadcast via WebSocket
5. Each client fetches a fresh copy of the page and morphs the DOM
6. The initiating client also sees the update via their redirect

### Remaining Problems

At this point we have real-time updates working, but two issues remain:

1. **Abrupt transitions** - Items appear/disappear instantly with no animation
2. **Other clients' forms are cleared** - When Client A submits, Client B's form input is wiped

---

## Step 2: The View Transitions Detour

We initially explored using the View Transitions API for animations. While it works, we discovered several complications:

1. **Delete animations look awkward** - The DOM updates instantly while the old element animates as a "ghost" over shifted content
2. **Requires browser support check** - Not all browsers support View Transitions
3. **Complex timing** - Need to coordinate `document.startViewTransition()` with Turbo's render cycle
4. **CSS selector limitations** - The `*` wildcard matches `root`, requiring explicit overrides

After extensive experimentation, we concluded that **simple CSS class-based animations** are more reliable and easier to maintain.

---

## Step 3: CSS Class-Based Animations

Instead of View Transitions, we detect changes ourselves and apply CSS classes.

### The Approach

1. In `turbo:before-render`, compare old and new DOM to detect creates, updates, and deletes
2. Queue animations to apply after render
3. In `turbo:render`, apply CSS animation classes to the appropriate elements
4. Remove classes after animation completes

### Animation Detection

```javascript
document.addEventListener("turbo:before-render", (event) => {
  if (!event.detail.newBody) return

  // Build maps of elements by their ID
  const oldMap = new Map()
  document.querySelectorAll('[data-turbo-refresh-id]').forEach(el => {
    oldMap.set(el.dataset.turboRefreshId, {
      version: el.dataset.turboRefreshVersion,
      el: el
    })
  })

  const newMap = new Map()
  event.detail.newBody.querySelectorAll('[data-turbo-refresh-id]').forEach(el => {
    newMap.set(el.dataset.turboRefreshId, {
      version: el.dataset.turboRefreshVersion,
      enterClass: el.dataset.turboRefreshEnterClass,
      updateClass: el.dataset.turboRefreshUpdateClass
    })
  })

  // Creates: in new but not old
  newMap.forEach((newData, id) => {
    if (!oldMap.has(id) && newData.enterClass) {
      pendingAnimations.push({ id, animClass: newData.enterClass })
    }
  })

  // Modifications: in both but version differs
  oldMap.forEach((oldData, id) => {
    if (newMap.has(id)) {
      const newData = newMap.get(id)
      if (oldData.version && newData.version && oldData.version !== newData.version && newData.updateClass) {
        pendingAnimations.push({ id, animClass: newData.updateClass })
      }
    }
  })
})

document.addEventListener("turbo:render", () => {
  pendingAnimations.forEach(({ id, animClass }) => {
    const el = document.querySelector(`[data-turbo-refresh-id="${id}"]`)
    if (el) {
      el.classList.add(animClass)
      el.addEventListener("animationend", () => el.classList.remove(animClass), { once: true })
    }
  })
  pendingAnimations = []
})
```

### Version-Based Change Detection

We use `data-turbo-refresh-version` with the record's `updated_at` timestamp to detect actual modifications:

```erb
data-turbo-refresh-version="<%= item.updated_at.to_i %>"
```

This ensures update animations only trigger when the database record has actually been modified, avoiding false positives when switching between different views of the same data (item display vs edit form).

---

## Step 4: Protecting Forms from Broadcast Morphs

When Client A submits, the broadcast refresh causes Client B's form to be morphed (cleared). We need to protect forms during broadcasts while still allowing them to clear after their own submission.

### First Attempt: data-turbo-permanent

Turbo provides `data-turbo-permanent` to preserve elements across updates. But it's too broad—it protects during ALL updates, including the submitter's own redirect.

### Second Attempt: Complex Flag Tracking

We tried tracking multiple flags (`inStreamRefresh`, `expectingRefreshVisit`, `userNavigationPending`) to distinguish between stream-delivered refreshes and navigation-triggered morphs. This worked but was fragile and hard to reason about.

### Final Solution: Track the Submitting Form

The key insight: we only need to know **which specific form is being submitted**. That form should be allowed to morph; all other protected forms should not.

```javascript
let submittingFormId = null

document.addEventListener("turbo:submit-start", (event) => {
  const form = event.target
  const wrapper = form.closest('[data-turbo-refresh-permanent]')
  submittingFormId = wrapper?.id || null
})

document.addEventListener("turbo:submit-end", (event) => {
  if (!event.detail.fetchResponse?.response?.redirected) {
    submittingFormId = null
  }
})

document.addEventListener("turbo:before-morph-element", (event) => {
  const el = event.target
  if (el.hasAttribute("data-turbo-refresh-permanent")) {
    if (el.id !== submittingFormId) {
      event.preventDefault()
    }
  }
})

document.addEventListener("turbo:render", () => {
  submittingFormId = null
})
```

This is much simpler:
- On submit, record which form wrapper is being submitted
- During morph, protect all permanent elements EXCEPT the one being submitted
- Clear the tracking after render completes

---

## Step 5: Delete Animations

Delete animations required special handling because the element is removed from the DOM.

### For Other Clients (Broadcast)

When a broadcast refresh arrives and an element is being deleted:

1. In `turbo:before-render`, detect deletions (element in old but not new)
2. Add to `pendingDeletions` map
3. In `turbo:before-morph-element`, if element is pending deletion:
   - Prevent the removal
   - Add animation class
   - After animation ends, manually remove the element

```javascript
document.addEventListener("turbo:before-morph-element", (event) => {
  const el = event.target
  const id = el.dataset?.turboRefreshId
  const exitClass = el.dataset?.turboRefreshExitClass

  if (id && exitClass && pendingDeletions.has(id)) {
    event.preventDefault()
    el.classList.add(exitClass)
    el.addEventListener("animationend", () => {
      el.remove()
      pendingDeletions.delete(id)
    }, { once: true })
  }
})
```

### For the Submitter

The submitter's delete goes through a redirect, not a morph. By the time `turbo:before-morph-element` fires, the page has already changed.

**Solution**: Intercept the click in the capture phase, animate, then proceed with the request.

```javascript
document.addEventListener("click", (event) => {
  const link = event.target.closest('a[data-turbo-method="delete"]')
  if (!link) return

  const item = link.closest('[data-turbo-refresh-exit-class]')
  if (!item) return

  // Skip if animation already done (allow the real click through)
  if (item.dataset.turboRefreshExitDone) return

  event.preventDefault()
  event.stopPropagation()

  const animClass = item.dataset.turboRefreshExitClass
  item.classList.add(animClass)
  item.addEventListener("animationend", () => {
    item.dataset.turboRefreshExitDone = "true"
    link.click()  // Re-trigger the click
  }, { once: true })
}, { capture: true })
```

Key points:
- Use `{ capture: true }` to run before Turbo's handlers
- Use `stopPropagation()` to prevent Turbo from seeing the first click
- Track completion with a data attribute to allow the second click through

---

## Step 6: Protected Form Animations

When a protected form (like an edit form) is open and another client modifies the same item, we want to flash the form to signal "data changed elsewhere."

### The Challenge

Protected forms don't morph, so we can't queue animations for after render—the element stays the same.

### Solution

For protected elements that won't morph, apply the animation immediately:

```javascript
// Modifications: in both but version differs
oldMap.forEach((oldData, id) => {
  if (newMap.has(id)) {
    const newData = newMap.get(id)
    if (oldData.version && newData.version && oldData.version !== newData.version && newData.updateClass) {
      // Protected elements that won't morph: animate immediately
      if (oldData.isPermanent && oldData.el.id !== submittingFormId) {
        applyAnimation(oldData.el, newData.updateClass)
      } else {
        // Element will be morphed: queue for after render
        pendingAnimations.push({ id, animClass: newData.updateClass })
      }
    }
  }
})
```

---

## Key Learnings

### 1. Simple beats clever

We went from View Transitions API (complex, browser-dependent) to CSS class-based animations (simple, universal). The simpler approach is more maintainable and handles edge cases better.

### 2. Track the specific form, not the state

Instead of complex flag tracking (`inStreamRefresh`, `userNavigationPending`, etc.), simply track which form is being submitted. This makes the logic clear and eliminates race conditions.

### 3. Version-based change detection

Use `data-turbo-refresh-version` with the record's `updated_at.to_i` timestamp. This is simpler than comparing content and correctly handles cases where the same data has different views (item display vs edit form).

### 4. Delete animations need special handling

- **For broadcast receivers**: Intercept the morph, animate, then manually remove
- **For submitters**: Intercept the click, animate, then re-trigger

### 5. Capture phase is your friend

When you need to intercept events before Turbo processes them, use `{ capture: true }`.

### 6. data-turbo-permanent is too broad

It protects during ALL morphs, including after form submission. Our custom `data-turbo-refresh-permanent` gives finer control.

---

## Data Attributes Reference

| Attribute | Purpose |
|-----------|---------|
| `data-turbo-refresh-id` | Unique identifier for tracking elements across morphs |
| `data-turbo-refresh-version` | Version for comparison (e.g., `updated_at.to_i`) |
| `data-turbo-refresh-permanent` | Protect element during broadcast morphs (but allow submitter's form to morph) |
| `data-turbo-refresh-enter-class` | CSS class to apply when element is created |
| `data-turbo-refresh-update-class` | CSS class to apply when element is modified |
| `data-turbo-refresh-exit-class` | CSS class to apply when element is deleted |

---

## Turbo Events Used

| Event | Purpose |
|-------|---------|
| `turbo:submit-start` | Track which form is being submitted |
| `turbo:submit-end` | Clear tracking if no redirect |
| `turbo:before-render` | Detect creates, updates, deletes by comparing old/new DOM |
| `turbo:before-morph-element` | Protect permanent elements, handle delete animations |
| `turbo:render` | Apply queued animations after DOM updates |

---

## Complete File Listing

- `app/models/item.rb` - `broadcasts_refreshes_to :list` and validation
- `app/controllers/items_controller.rb` - redirect on success, `turbo_stream.replace` on error
- `app/views/items/_form.html.erb` - New item form with `data-turbo-refresh-permanent`
- `app/views/items/_edit_form.html.erb` - Edit form with protection and animation attributes
- `app/views/items/_item.html.erb` - Item display with all animation attributes
- `app/javascript/application.js` - Form protection and animation logic
- `app/assets/stylesheets/application.css` - Animation keyframes and classes
