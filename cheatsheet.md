# Turbo Refresh + View Transitions Cheatsheet

Quick implementation guide for animating Turbo Refresh morphs with View Transitions API.

## Prerequisites

- Rails 8+ with Turbo
- A model using `broadcasts_refreshes_to`

## Step 1: Enable View Transitions

Add to your layout's `<head>`:

```erb
<meta name="view-transition" content="same-origin">
<%= turbo_refreshes_with method: :morph, scroll: :preserve %>
```

## Step 2: Add the JavaScript

Add to `app/javascript/application.js`:

```javascript
// ========== FORM PROTECTION ==========
// Protects forms during broadcast refreshes while allowing them to clear on redirect.

let inStreamRefresh = false
let expectingRefreshVisit = false
let userNavigationPending = false

document.addEventListener("turbo:submit-start", () => {
  userNavigationPending = true
})

document.addEventListener("turbo:submit-end", (event) => {
  if (!event.detail.fetchResponse?.response?.redirected) {
    userNavigationPending = false
  }
})

document.addEventListener("turbo:click", () => {
  userNavigationPending = true
})

document.addEventListener("turbo:before-stream-render", (event) => {
  if (event.target.getAttribute("action") === "refresh") {
    inStreamRefresh = true
    expectingRefreshVisit = true
  }
})

document.addEventListener("turbo:before-morph-element", (event) => {
  if (inStreamRefresh && event.target.hasAttribute("data-turbo-stream-refresh-permanent")) {
    event.preventDefault()
  }
})

document.addEventListener("turbo:visit", () => {
  if (userNavigationPending) {
    inStreamRefresh = false
    userNavigationPending = false
    expectingRefreshVisit = false
  } else if (expectingRefreshVisit) {
    expectingRefreshVisit = false
  } else {
    inStreamRefresh = false
  }
})

document.addEventListener("turbo:render", () => {
  inStreamRefresh = false
  userNavigationPending = false
})

// ========== VIEW TRANSITIONS ==========
// Animates only elements that actually change (creates, deletes, modifications).

document.addEventListener("turbo:before-render", (event) => {
  if (!event.detail.newBody) return
  if (!document.startViewTransition) return

  const oldMap = new Map()
  document.querySelectorAll('[data-view-transition-id]').forEach(el => {
    oldMap.set(el.dataset.viewTransitionId, {
      element: el,
      text: el.textContent.trim()
    })
  })

  const newMap = new Map()
  event.detail.newBody.querySelectorAll('[data-view-transition-id]').forEach(el => {
    newMap.set(el.dataset.viewTransitionId, {
      element: el,
      text: el.textContent.trim()
    })
  })

  const toAnimate = []

  // Creates: in new but not old
  newMap.forEach((newData, id) => {
    if (!oldMap.has(id)) {
      toAnimate.push({ id, oldEl: null, newEl: newData.element })
    }
  })

  // Deletes: in old but not new
  oldMap.forEach((oldData, id) => {
    if (!newMap.has(id)) {
      toAnimate.push({ id, oldEl: oldData.element, newEl: null })
    }
  })

  // Modifications: in both but textContent differs
  oldMap.forEach((oldData, id) => {
    if (newMap.has(id)) {
      const newData = newMap.get(id)
      if (oldData.text !== newData.text) {
        toAnimate.push({ id, oldEl: oldData.element, newEl: newData.element })
      }
    }
  })

  if (toAnimate.length === 0) return

  event.preventDefault()

  toAnimate.forEach(({ id, oldEl }) => {
    if (oldEl) oldEl.style.viewTransitionName = id
  })

  const transition = document.startViewTransition(() => {
    toAnimate.forEach(({ id, newEl }) => {
      if (newEl) newEl.style.viewTransitionName = id
    })
    event.detail.resume()
  })

  transition.finished.then(() => {
    document.querySelectorAll('[data-view-transition-id]').forEach(el => {
      el.style.viewTransitionName = ''
    })
  })
})
```

## Step 3: Add the CSS

Based on jQuery/jQuery UI defaults: **400ms** duration, **ease-in-out** (swing) easing, **#ffff99** highlight color.

Add to your stylesheet:

```css
/*
 * View Transitions animations
 * jQuery/jQuery UI defaults: 400ms, ease-in-out (swing), #ffff99 highlight
 */
@keyframes slide-down {
  from { max-height: 0; opacity: 0; overflow: hidden; }
  to { max-height: 100px; opacity: 1; overflow: hidden; }
}

@keyframes slide-up {
  from { max-height: 100px; opacity: 1; overflow: hidden; }
  to { max-height: 0; opacity: 0; overflow: hidden; }
}

@keyframes highlight {
  0%, 100% { box-shadow: none; }
  20% { box-shadow: 0 0 0 4px #ffff99, 0 0 12px #ffff99; }
}

/* Disable ALL default animations first */
::view-transition-old(*),
::view-transition-new(*) {
  animation: none;
}

/* Deletes: only old exists - slide up */
::view-transition-old(*):only-child {
  animation: slide-up 400ms ease-in-out forwards;
}

/* Creates: only new exists - slide down */
::view-transition-new(*):only-child {
  animation: slide-down 400ms ease-in-out;
}

/* Modifications: both exist - highlight */
::view-transition-old(*):not(:only-child) {
  animation: none;
  display: none;
}

::view-transition-new(*):not(:only-child) {
  animation: highlight 400ms ease-in-out;
}

/* Disable root animations */
::view-transition-old(root),
::view-transition-new(root) {
  animation: none !important;
  display: block !important;
}
```

## Step 4: Mark Elements to Animate

Add `data-view-transition-id` with a **unique, stable ID** to elements you want animated:

```erb
<%# app/views/items/_item.html.erb %>
<div id="<%= dom_id(item) %>"
     data-view-transition-id="item-<%= item.id %>">
  <%= item.title %>
  <!-- ... -->
</div>
```

**Important**: The ID must be:
- Unique across the page
- Stable (same item always has same ID)
- Valid CSS identifier (letters, numbers, hyphens, underscores)

## Step 5: Protect Forms from Broadcast Morphs

Add `data-turbo-stream-refresh-permanent` to forms that should be preserved when other users' changes arrive:

```erb
<%# app/views/items/_form.html.erb %>
<div id="new_item_form" data-turbo-stream-refresh-permanent>
  <%= form_with model: [list, item] do |f| %>
    <%= f.text_field :title %>
    <%= f.submit "Add" %>
    <% if item.errors[:title].any? %>
      <div class="error"><%= item.errors[:title].first %></div>
    <% end %>
  <% end %>
</div>
```

## Step 6: Controller Pattern

```ruby
def create
  @item = @list.items.build(item_params)
  if @item.save
    redirect_to @list, status: :see_other  # Form clears via redirect morph
  else
    render turbo_stream: turbo_stream.replace(
      "new_item_form",
      partial: "items/form",
      locals: { list: @list, item: @item }
    ), status: :unprocessable_entity  # Errors display inline
  end
end
```

**Key points:**
- Use `status: :see_other` (303) for redirects after POST/PATCH/DELETE
- Use `status: :unprocessable_entity` (422) for validation errors
- Use `turbo_stream.replace` for error display (bypasses form protection)

## How It Works

| Scenario | Animation | jQuery Equivalent |
|----------|-----------|-------------------|
| Element added | Expands down | `slideDown()` |
| Element removed | Collapses up | `slideUp()` |
| Element modified | Yellow flash | `highlight()` |

| Scenario | Form Behavior |
|----------|---------------|
| User submits successfully | Redirect → form clears |
| User submits with errors | `turbo_stream.replace` → errors display |
| Another user triggers refresh | Form protected → typing preserved |

## Customizing Animations

The defaults match jQuery: 400ms, ease-in-out. Customize as needed:

```css
/* Slower animations (jQuery "slow" = 600ms) */
::view-transition-old(*):only-child {
  animation: slide-up 600ms ease-in-out forwards;
}

/* Faster animations (jQuery "fast" = 200ms) */
::view-transition-new(*):only-child {
  animation: slide-down 200ms ease-in-out;
}

/* Different highlight color (Bootstrap success green) */
@keyframes highlight {
  0%, 100% { box-shadow: none; }
  20% { box-shadow: 0 0 0 4px #d4edda, 0 0 12px #d4edda; }
}

/* Simple fade instead of slide */
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

## Troubleshooting

### All elements animate, not just changed ones
- Make sure you're using `data-view-transition-id` (not inline `view-transition-name`)
- Check that the JS is detecting changes (add `console.log` statements)

### No animations at all
- Verify browser supports View Transitions (`document.startViewTransition` exists)
- Check browser console for errors
- Ensure the `<meta name="view-transition">` tag is present

### Form doesn't clear after submission
- Verify controller uses `redirect_to` with `status: :see_other`
- Check that form has `data-turbo-stream-refresh-permanent` (not `data-turbo-permanent`)

### Form clears when OTHER users submit
- Make sure the form wrapper has `data-turbo-stream-refresh-permanent`
- Verify the full JS (form protection section) is included

### Delete animation doesn't show
- Add `forwards` to the animation to hold final state
- Check that the element is actually being removed (not just hidden)

### Highlight/background animation not visible
- View Transition pseudo-elements contain **snapshot images** of elements
- `background-color` animates behind the image (invisible)
- Use `box-shadow` instead - it renders around the snapshot and is visible

## Quick Reference

| Attribute | Purpose |
|-----------|---------|
| `data-view-transition-id="unique-id"` | Mark element for animation |
| `data-turbo-stream-refresh-permanent` | Protect during broadcast refreshes only |
| `data-turbo-permanent` | Protect during ALL morphs (usually too broad) |

| CSS Selector | Matches |
|--------------|---------|
| `::view-transition-old(*):only-child` | Deleted elements |
| `::view-transition-new(*):only-child` | Created elements |
| `::view-transition-old(*):not(:only-child)` | Modified elements (old state) |
| `::view-transition-new(*):not(:only-child)` | Modified elements (new state) |

| jQuery Timing | CSS Equivalent |
|---------------|----------------|
| Default | `400ms` |
| `'fast'` | `200ms` |
| `'slow'` | `600ms` |
| `'swing'` (default easing) | `ease-in-out` |
| `'linear'` | `linear` |
| Highlight color | `#ffff99` |
