# Building Real-Time Todo Lists with Turbo Refresh and View Transitions

This document chronicles our journey implementing a real-time collaborative todo list using Rails 8's Turbo Refresh with View Transitions API for smooth animations. What seemed like a straightforward feature revealed subtle interactions between Turbo's various mechanisms.

## The Goal

Build a todo app where:
- Multiple users can collaborate on the same list in real-time
- Items animate in/out smoothly using the View Transitions API
- When one user adds an item, all connected clients see it appear
- Users typing in the form shouldn't lose their input when others make changes
- Validation errors display nicely inline

## The Tech Stack

- **Rails 8.1** with Turbo (Hotwire)
- **Bootstrap 5** for styling
- **View Transitions API** for animations
- **Action Cable** for WebSocket broadcasts

## Important: Turbo and HTTP Status Codes

Before diving in, a critical note about status codes. Turbo overrides browser defaults for form handling, so proper status codes are essential:

**For validation errors**, return `422 Unprocessable Entity`:
```ruby
render :new, status: :unprocessable_entity
```

**For redirects after non-GET requests** (POST, PATCH, PUT, DELETE), use `303 See Other`:
```ruby
redirect_to @list, status: :see_other
```

Why 303? With a 302 redirect, browsers might follow the redirect using the *original* HTTP method. After a DELETE request, this could cause a double-delete. The 303 status guarantees the redirect is followed with GET.

See the [Turbo Drive documentation](https://turbo.hotwired.dev/handbook/drive#redirecting-after-a-form-submission) and [this excellent explanation](https://learnhotwire.com/sections/turbo-drive/lessons/form-redirects-and-errors) for more details.

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

The controller redirects after creating an item:

```ruby
def create
  @item = @list.items.build(item_params)
  if @item.save
    redirect_to @list, status: :see_other
  else
    render :new, status: :unprocessable_entity
  end
end
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

## Step 2: Adding View Transitions (Smooth Animations)

The [View Transitions API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API) lets browsers animate between DOM states. Turbo integrates with it beautifully.

### Implementation

Add the meta tag to enable View Transitions:

```erb
<%# app/views/layouts/application.html.erb %>
<meta name="view-transition" content="same-origin">
<%= turbo_refreshes_with method: :morph, scroll: :preserve %>
```

Give each item a unique `view-transition-name`:

```erb
<%# app/views/items/_item.html.erb %>
<div class="list-group-item" style="view-transition-name: item-<%= item.id %>">
  <%= item.title %>
  <!-- ... -->
</div>
```

Define the animations in CSS:

```css
/* app/assets/stylesheets/application.css */
@keyframes slide-in {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes slide-out {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(10px); }
}

::view-transition-old(item-*):only-child {
  animation: slide-out 0.3s ease-out;
}

::view-transition-new(item-*):only-child {
  animation: slide-in 0.3s ease-out;
}
```

### How It Works

The `view-transition-name` property tells the browser to track specific elements across DOM changes:

- **When an item is deleted**: The element with `view-transition-name: item-5` exists in the old state but not the new → `::view-transition-old(item-5)` triggers the exit animation
- **When an item is created**: The element exists in the new state but not the old → `::view-transition-new(item-6)` triggers the enter animation
- The `item-*` wildcard selector matches any view-transition-name starting with "item-"
- The `:only-child` pseudo-class ensures animations only run for elements that are purely entering or exiting (not both)

### What About Modifications?

When an item is **modified** (edited), it exists in both old and new states. You might expect to animate modifications with `:not(:only-child)`:

```css
::view-transition-old(*.item):not(:only-child) {
  display: none;
}

::view-transition-new(*.item):not(:only-child) {
  animation: pop 0.3s ease-out;
}
```

**However, this causes ALL items to animate, not just the modified one.**

The issue: View Transitions creates pseudo-elements for **every** element with a `view-transition-name`, not just elements that changed. Since all unchanged items exist in both old and new states, they all have both `::view-transition-old` and `::view-transition-new` pseudo-elements. The `:not(:only-child)` selector matches all of them.

We also tried `view-transition-class` (View Transitions Level 2), which lets you target elements by class instead of by name pattern:

```erb
<div style="view-transition-name: item-<%= item.id %>; view-transition-class: item">
```

```css
::view-transition-old(*.item):only-child { ... }  /* Works for deletes */
::view-transition-new(*.item):only-child { ... }  /* Works for creates */
```

This works identically to the `item-*` wildcard for creates/deletes, but has the same limitation for modifications.

**Current status**: Creates and deletes animate beautifully. Modifications cannot be animated with CSS alone because there's no CSS selector that means "only the element whose content actually changed."

### Result

Items now animate smoothly in and out! But we still have the form-clearing problem.

---

## Step 3: Protecting Forms with data-turbo-permanent

Turbo provides `data-turbo-permanent` to preserve elements across page updates:

```erb
<div id="new_item_form" data-turbo-permanent>
  <%= form_with model: [list, item] do |f| %>
    <%= f.text_field :title, placeholder: "Add a new item..." %>
    <%= f.submit "Add" %>
  <% end %>
</div>
```

### How data-turbo-permanent Works

We dove into the [Turbo source code](https://github.com/hotwired/turbo/blob/main/src/core/morphing.js) to understand this:

```javascript
// From turbo/src/core/morphing.js
beforeNodeMorphed = (currentElement, newElement) => {
  if (currentElement instanceof Element) {
    if (!currentElement.hasAttribute("data-turbo-permanent") && ...) {
      // proceed with morph
    } else {
      return false // skip morph entirely
    }
  }
}
```

During a morph, if an element has `data-turbo-permanent`, Turbo skips it entirely—the element stays exactly as-is in the DOM.

### The Problem

**The initiating client's form also doesn't clear.**

When you submit the form, the redirect triggers a Turbo visit. But `data-turbo-permanent` is respected during *all* page updates, not just morphs from broadcasts. The form retains whatever was typed, even after successful submission.

---

## Step 4: Attempting Turbo Stream Replace

We tried having the controller return a `turbo_stream.replace` to clear the form:

```ruby
def create
  @item = @list.items.build(item_params)
  if @item.save
    render turbo_stream: turbo_stream.replace(
      "new_item_form",
      partial: "items/form",
      locals: { list: @list, item: @list.items.build }
    )
  end
end
```

### Understanding Turbo Stream Preservation

Back to the source—this time [stream_message_renderer.js](https://github.com/hotwired/turbo/blob/main/src/core/streams/stream_message_renderer.js):

```javascript
render({ fragment }) {
  Bardo.preservingPermanentElements(this, getPermanentElementMapForFragment(fragment), () => {
    // render the stream
  })
}

enteringBardo(currentPermanentElement, newPermanentElement) {
  newPermanentElement.replaceWith(currentPermanentElement.cloneNode(true))
}
```

Turbo Streams *also* respect `data-turbo-permanent`! The "Bardo" mechanism (named after the Tibetan concept of an intermediate state) preserves permanent elements by cloning them back after the stream action completes.

### The Problem

`data-turbo-permanent` blocks both morphs AND Turbo Stream actions. We can't use it to selectively protect against broadcasts while allowing direct replacements.

---

## Step 5: turbo_stream.refresh from Controller

We tried returning `turbo_stream.refresh` to trigger a morph with View Transitions for the initiating client:

```ruby
def create
  @item = @list.items.build(item_params)
  if @item.save
    render turbo_stream: [
      turbo_stream.replace("new_item_form", partial: "items/form", ...),
      turbo_stream.refresh
    ]
  end
end
```

### The Problem

The refresh wasn't reaching the initiating client. Examining the server logs revealed the issue:

```
Broadcasting to ...: "<turbo-stream request-id=\"abc123\" action=\"refresh\">"
```

Turbo's refresh mechanism includes **request-id tracking** to prevent the initiating client from processing their own broadcast (which would cause double updates). The controller response and broadcast were being deduplicated.

---

## Intermediate Solution: Stimulus + data-turbo-permanent + Separate Error Container

After all these attempts, we arrived at a hybrid solution that cleanly separates concerns.

### 1. Protect the form with data-turbo-permanent

```erb
<%# app/views/items/_form.html.erb %>
<div id="new_item_form" data-turbo-permanent>
  <%= form_with model: [list, item],
                data: { controller: "form", action: "turbo:submit-end->form#clear" } do |f| %>
    <div class="input-group">
      <%= f.text_field :title, class: "form-control",
                       data: { form_target: "input" } %>
      <%= f.submit "Add", class: "btn btn-primary" %>
    </div>
  <% end %>
</div>
<div id="item_form_errors"></div>
```

### 2. Use Stimulus to clear the form on successful submission

```javascript
// app/javascript/controllers/form_controller.js
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["input"]

  clear(event) {
    if (event.detail.success) {
      this.element.reset()
      this.inputTarget.classList.remove("is-invalid")
    } else {
      this.inputTarget.classList.add("is-invalid")
    }
  }
}
```

The `turbo:submit-end` event fires after form submission completes, with `event.detail.success` indicating whether the response was successful (2xx/3xx status).

### 3. Handle success and errors differently in the controller

```ruby
def create
  @item = @list.items.build(item_params)
  if @item.save
    redirect_to @list, status: :see_other
  else
    render turbo_stream: turbo_stream.update(
      "item_form_errors",
      partial: "items/errors",
      locals: { item: @item }
    ), status: :unprocessable_entity
  end
end
```

### 4. Error display outside the permanent container

```erb
<%# app/views/items/_errors.html.erb %>
<% if item.errors.any? %>
  <div class="text-danger small" style="margin-top: -0.75rem;">
    <%= item.errors.full_messages.to_sentence %>
  </div>
<% end %>
```

### Why This Works

| Scenario | What Happens |
|----------|-------------|
| **User submits successfully** | Redirect (303) → `turbo:submit-end` fires with `success: true` → Stimulus clears form → Turbo follows redirect → Page loads with View Transitions showing new item |
| **User submits invalid data** | 422 response → `turbo:submit-end` fires with `success: false` → Stimulus adds `is-invalid` class → Error container updated via Turbo Stream → Form input preserved |
| **Another user submits** | Broadcast morph arrives → `data-turbo-permanent` protects form → Items list morphs with View Transitions → User's typing preserved |

**Why does the submitter need a redirect?** You might wonder why, given that `broadcasts_refreshes_to` broadcasts to all subscribers. The answer is **request-id deduplication**: Turbo tags each broadcast with the request-id of the initiating request, and the submitting client ignores broadcasts that match their own request-id (to prevent double updates). This means the broadcast only reaches *other* clients—the submitter must receive their update through the redirect response.

### The Error Container Trick

We can't use `turbo_stream.replace` on the form itself (blocked by `data-turbo-permanent`), so we put a separate `#item_form_errors` div *outside* the permanent container. This div can be freely updated via Turbo Streams.

---

## Step 6: The Quest for a Stimulus-Free Solution

The Stimulus solution worked, but it felt like unnecessary complexity. We were using JavaScript to clear a form after submission—something that should "just work" with proper Turbo configuration. The core issue: `data-turbo-permanent` is too broad. It protects elements during *all* updates, but we only needed protection during *stream-delivered refresh* morphs.

### The Ideal Attribute

What if we had `data-turbo-morph-permanent`—an attribute that:
- **Protects** during morphs (stream-delivered refreshes)
- **Allows** Turbo Stream actions (replace, update) to modify elements

This would let us:
1. Use `turbo_stream.replace` to clear the form on success
2. Use `turbo_stream.replace` to show validation errors
3. Still protect other clients' forms during stream-delivered refresh morphs

### Discovering turbo:before-morph-element

Digging into the Turbo source, we found that morphs dispatch a cancelable `turbo:before-morph-element` event:

```javascript
// From turbo/src/core/morphing.js
beforeNodeMorphed = (currentElement, newElement) => {
  if (currentElement instanceof Element) {
    if (!currentElement.hasAttribute("data-turbo-permanent") && ...) {
      const event = dispatch("turbo:before-morph-element", {
        cancelable: true,
        target: currentElement,
        detail: { currentElement, newElement }
      })
      return !event.defaultPrevented
    }
  }
}
```

**Key insight**: We can listen for this event and call `preventDefault()` to block specific morphs—without modifying Turbo itself!

Meanwhile, Turbo Stream actions (replace, update, etc.) go through a completely different code path (`Bardo` in `stream_message_renderer.js`) that only checks for `data-turbo-permanent`. They don't fire the morph event.

### First Attempt: data-turbo-morph-permanent

We implemented a simple event listener:

```javascript
document.addEventListener("turbo:before-morph-element", (event) => {
  if (event.target.hasAttribute("data-turbo-morph-permanent")) {
    event.preventDefault()
  }
})
```

And updated the form:

```erb
<div id="new_item_form" data-turbo-morph-permanent>
  <%= form_with model: [list, item] do |f| %>
    <!-- form fields with inline errors -->
  <% end %>
</div>
```

With the controller using `turbo_stream.replace` for both success and error cases.

### The Problem

It didn't work for the submitter. The form was protected during *all* morphs—including the morph triggered by following the redirect after form submission. We wanted:

- **Stream-delivered refresh morphs**: Protect the form (other users' typing preserved)
- **Navigation morphs** (redirects): Allow the form to update (submitter sees cleared form)

---

## Final Solution: data-turbo-stream-refresh-permanent

The solution: distinguish between morphs triggered by **stream-delivered refreshes** versus morphs triggered by **navigation**.

### The Key: turbo:before-stream-render

When a broadcast message arrives, Turbo fires `turbo:before-stream-render` before processing it. Navigation-triggered morphs don't fire this event—they're just regular page loads that get morphed.

A simple implementation might look like:

```javascript
// Simple but INCOMPLETE - see below for the full solution
let inStreamRefresh = false

document.addEventListener("turbo:before-stream-render", (event) => {
  if (event.target.getAttribute("action") === "refresh") {
    inStreamRefresh = true
  }
})

document.addEventListener("turbo:before-morph-element", (event) => {
  if (inStreamRefresh && event.target.hasAttribute("data-turbo-stream-refresh-permanent")) {
    event.preventDefault()
  }
})

document.addEventListener("turbo:render", () => {
  inStreamRefresh = false
})
```

However, this simple approach has race condition issues that we'll address below.

### The Form

```erb
<%# app/views/items/_form.html.erb %>
<div id="new_item_form" data-turbo-stream-refresh-permanent>
  <%= form_with model: [list, item], class: "mb-3" do |f| %>
    <div class="input-group">
      <%= f.text_field :title, class: "form-control", placeholder: "Add a new item..." %>
      <%= f.submit "Add", class: "btn btn-primary" %>
    </div>
    <% if item.errors[:title].any? %>
      <div class="text-danger small"><%= item.errors[:title].first %></div>
    <% end %>
  <% end %>
</div>
```

### The Controller

```ruby
def create
  @item = @list.items.build(item_params)
  if @item.save
    redirect_to @list, status: :see_other
  else
    render turbo_stream: turbo_stream.replace(
      "new_item_form",
      partial: "items/form",
      locals: { list: @list, item: @item }
    ), status: :unprocessable_entity
  end
end
```

### Why This Works

| Scenario | Event Flow | Form Behavior |
|----------|------------|---------------|
| **Submitter succeeds** | POST → redirect (303) → GET → navigation morph | `inStreamRefresh` is `false` → form morphs normally → clears |
| **Submitter fails validation** | POST → 422 → `turbo_stream.replace` | Bardo only checks `data-turbo-permanent` → replacement works → shows errors |
| **Other client adds item** | Broadcast refresh → `turbo:before-stream-render` → morph | `inStreamRefresh` is `true` → form protected → typing preserved |

### Benefits Over the Stimulus Solution

1. **No Stimulus controller needed** - Form clearing happens naturally through the redirect morph
2. **Errors inside the form** - No separate error container; errors render inline with Bootstrap styling
3. **Single partial** - The form partial handles both fresh and error states
4. **Cleaner mental model** - Protection is scoped to exactly what we need: stream-delivered refreshes

### Protecting Edit Forms Too

The same pattern works for inline edit forms. When a user clicks "Edit" on an item, we can swap the item display for an edit form using `turbo_stream.replace`:

```ruby
def edit
  render turbo_stream: turbo_stream.replace(
    @item,
    partial: "items/edit_form",
    locals: { item: @item }
  )
end

def update
  if @item.update(item_params)
    redirect_to @list, status: :see_other
  else
    render turbo_stream: turbo_stream.replace(
      @item,
      partial: "items/edit_form",
      locals: { item: @item }
    ), status: :unprocessable_entity
  end
end
```

The edit form partial also needs `data-turbo-stream-refresh-permanent`:

```erb
<%# app/views/items/_edit_form.html.erb %>
<div id="<%= dom_id(item) %>"
     class="list-group-item"
     style="view-transition-name: item-<%= item.id %>"
     data-turbo-stream-refresh-permanent>
  <%= form_with model: [item.list, item] do |f| %>
    <div class="input-group">
      <%= f.text_field :title, class: "form-control", autofocus: true %>
      <%= f.submit "Save", class: "btn btn-primary" %>
      <%= link_to "Cancel", list_path(item.list), class: "btn btn-outline-secondary" %>
    </div>
    <% if item.errors[:title].any? %>
      <div class="text-danger small"><%= item.errors[:title].first %></div>
    <% end %>
  <% end %>
</div>
```

Now if User A is editing an item and User B adds a new item (triggering a broadcast refresh), User A's edit form is preserved. The same scenarios apply:

| Scenario | Form Behavior |
|----------|---------------|
| **User saves edit** | Redirect → navigation morph → edit form replaced with updated item |
| **User's edit fails validation** | `turbo_stream.replace` works → shows errors inline |
| **Another user triggers refresh** | `inStreamRefresh` is `true` → edit form protected |

---

## The Complication: Refresh Actions Trigger Internal Visits

The simple JavaScript above has a critical flaw. When debugging with console.log statements, we discovered an unexpected event sequence:

```
turbo:before-stream-render (refresh)  → inStreamRefresh = true
turbo:visit                           → inStreamRefresh = false (reset too early!)
turbo:before-morph-element            → inStreamRefresh is false, form NOT protected!
```

**The problem**: Turbo's `refresh` action internally triggers a `turbo:visit` to fetch fresh page content for morphing. Our simple listener reset `inStreamRefresh` on any visit, clearing the flag before the morphs even happened.

### Distinguishing Refresh Visits from Navigation Visits

We need to track whether a `turbo:visit` is:
1. **User-initiated** (form submit redirect, link click) → should clear protection
2. **Refresh-triggered** (internal visit from a refresh action) → should preserve protection

The solution uses three flags:

```javascript
let inStreamRefresh = false
let expectingRefreshVisit = false
let userNavigationPending = false
```

- `inStreamRefresh`: Are we currently processing a stream-delivered refresh?
- `expectingRefreshVisit`: Did we just receive a refresh action that will trigger a visit?
- `userNavigationPending`: Did the user just initiate a navigation (form submit, link click)?

### The Validation Error Edge Case

There's another subtle bug: what happens when a user submits invalid data?

1. `turbo:submit-start` fires → `userNavigationPending = true`
2. Server returns `turbo_stream.replace` (422 status) — no redirect
3. No `turbo:visit` fires, so `userNavigationPending` stays `true`
4. Later, another client's broadcast arrives
5. The `turbo:visit` handler (from the refresh) sees `userNavigationPending = true`
6. It incorrectly thinks this is a user-initiated navigation and clears protection!

**The fix**: Reset `userNavigationPending` when a form submission completes without a redirect.

### Complete JavaScript Implementation

```javascript
// app/javascript/application.js
import "@hotwired/turbo-rails"
import "controllers"

// Protect elements with data-turbo-stream-refresh-permanent during
// stream-delivered refreshes only. Navigation-triggered morphs (like
// following a redirect) are allowed through so forms clear after submission.
let inStreamRefresh = false
let expectingRefreshVisit = false
let userNavigationPending = false

// Track user-initiated navigations (form submits, link clicks)
document.addEventListener("turbo:submit-start", () => {
  userNavigationPending = true
})

document.addEventListener("turbo:submit-end", (event) => {
  // If submission didn't result in a redirect (e.g., validation error),
  // reset the pending flag since no navigation will follow
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

// Reset flag when navigation starts
document.addEventListener("turbo:visit", () => {
  if (userNavigationPending) {
    // User-initiated navigation (redirect from form submit, link click)
    inStreamRefresh = false
    userNavigationPending = false
    expectingRefreshVisit = false
  } else if (expectingRefreshVisit) {
    // Visit triggered by refresh action
    expectingRefreshVisit = false
  } else {
    inStreamRefresh = false
  }
})

document.addEventListener("turbo:render", () => {
  inStreamRefresh = false
  userNavigationPending = false
})
```

### Event Flow Diagrams

**Submitter succeeds (form clears correctly):**
```
turbo:submit-start           → userNavigationPending = true
[POST to server]
[Server redirects 303]
turbo:submit-end             → redirected=true, flag stays true
turbo:visit                  → userNavigationPending=true, so clear ALL flags
turbo:before-morph-element   → inStreamRefresh=false, form morphs normally
turbo:render                 → cleanup
```

**Submitter fails validation (form protected, shows errors):**
```
turbo:submit-start           → userNavigationPending = true
[POST to server]
[Server returns 422 + turbo_stream.replace]
turbo:submit-end             → redirected=false, userNavigationPending = false
[turbo_stream.replace runs]  → Bardo checks data-turbo-permanent only, replacement works
```

**Other client receives broadcast (form protected):**
```
[WebSocket delivers broadcast]
turbo:before-stream-render   → inStreamRefresh=true, expectingRefreshVisit=true
turbo:visit                  → userNavigationPending=false, expectingRefreshVisit=true
                               so just clear expectingRefreshVisit
turbo:before-morph-element   → inStreamRefresh=true, form PROTECTED
turbo:render                 → cleanup
```

**Edge case: validation error, then broadcast arrives (form still protected):**
```
[After validation error, userNavigationPending was reset to false]
[WebSocket delivers broadcast]
turbo:before-stream-render   → inStreamRefresh=true, expectingRefreshVisit=true
turbo:visit                  → userNavigationPending=false, so check expectingRefreshVisit
                               expectingRefreshVisit=true, so just clear it
turbo:before-morph-element   → inStreamRefresh=true, form PROTECTED ✓
turbo:render                 → cleanup
```

---

## Appendix: Alternative Approach with request_id: nil

After getting the `data-turbo-stream-refresh-permanent` solution working, we explored an alternative that bypasses the redirect entirely.

### The Discovery: request_id: nil

Turbo's `turbo_stream.refresh` accepts a `request_id` parameter:

```ruby
# From turbo-rails/app/models/turbo/streams/tag_builder.rb
def refresh(request_id: Turbo.current_request_id, ...)
```

By default, it uses the current request's ID—which is why deduplication kicks in. But you can override it:

```ruby
turbo_stream.refresh(request_id: nil)
```

Setting `request_id: nil` means the refresh action has no request-id to match against, so the submitting client processes it instead of ignoring it.

### The Alternative Controller

```ruby
def create
  @item = @list.items.build(item_params)
  if @item.save
    render turbo_stream: [
      turbo_stream.refresh(request_id: nil),
      turbo_stream.replace("new_item_form", partial: "items/form", locals: { list: @list, item: @list.items.build })
    ]
  else
    render turbo_stream: turbo_stream.replace(
      "new_item_form",
      partial: "items/form",
      locals: { list: @list, item: @item }
    ), status: :unprocessable_entity
  end
end
```

This works—the submitter receives the refresh and the form clears. However, we decided to stick with the redirect approach for a few reasons:

1. **Simpler code** - The redirect is a single line vs. a multi-action Turbo Stream response
2. **Standard Rails pattern** - Redirecting after successful form submission is conventional
3. **Browser history** - The redirect updates the browser URL and history properly
4. **Fewer moving parts** - Less custom code to maintain

The `request_id: nil` trick is worth knowing about for cases where you specifically need to bypass deduplication, but for typical CRUD operations, redirects remain the cleaner choice.

---

## Key Learnings

### 1. data-turbo-permanent is powerful but broad

It protects elements during:
- Page morphs (including stream-delivered refreshes)
- Regular Turbo visits (redirects, link clicks)
- Turbo Stream actions (replace, update, etc.)

There's no built-in way to say "protect during morphs but not during stream actions"—but you can build one with Turbo's events.

### 2. Turbo's request-id prevents duplicate processing

Broadcasts include a `request-id` that matches the initiating request. This prevents the submitting client from processing their own broadcast (avoiding double updates). But it also means you can't rely solely on broadcasts to update the initiating client—they need their own update path (typically a redirect). In practice: the broadcast updates *other* clients, the redirect updates *the submitter*.

### 3. Turbo's events let you extend its behavior

Key events for customization:
- `turbo:before-stream-render` - Fires before processing stream messages. Use it to detect stream-delivered updates.
- `turbo:before-morph-element` - Cancelable event fired before each element is morphed. Call `preventDefault()` to protect specific elements.
- `turbo:visit` - Fires when navigation starts, including internal visits triggered by refresh actions.
- `turbo:submit-start` / `turbo:submit-end` - Bracket form submissions. `turbo:submit-end` includes `event.detail.fetchResponse.response.redirected` to detect redirects.
- `turbo:click` - Fires when a Turbo-enabled link is clicked.
- `turbo:render` - Fires after rendering completes. Good for cleanup.

By combining these events, you can implement custom preservation logic that Turbo doesn't provide out of the box.

### 4. Refresh actions trigger internal visits

This was a surprising discovery: when Turbo processes a `<turbo-stream action="refresh">`, it internally triggers a `turbo:visit` to fetch fresh content for morphing. This means any `turbo:visit` listener will fire for both:
- User-initiated navigations (link clicks, form redirects)
- System-initiated visits (from refresh actions)

If you're tracking state across these events, you need to distinguish between them.

### 5. Morphs and Turbo Streams use different code paths

Understanding Turbo's internals helps:
- **Morphs** (page refreshes, stream-delivered refreshes) use `morphing.js` and fire `turbo:before-morph-element`
- **Turbo Streams** (replace, update, append, etc.) use `stream_message_renderer.js` and `Bardo`

This separation is what makes `data-turbo-stream-refresh-permanent` possible—we can intercept morphs without affecting stream actions.

### 6. Status codes matter with Turbo

Always use:
- `status: :unprocessable_entity` (422) for validation errors
- `status: :see_other` (303) for redirects after non-GET requests

### 7. Name custom attributes descriptively

We evolved through several names:
- `data-turbo-morph-permanent` - Too vague; suggested protection during all morphs
- `data-turbo-stream-refresh-permanent` - Precisely describes when protection applies

Clear naming prevents confusion and makes the behavior self-documenting.

### 8. View Transitions: The Full Solution

After extensive experimentation, we discovered several key insights about View Transitions:

#### Wildcard selectors don't work as expected

The CSS selector `item-*` is **not** a glob pattern—it's interpreted literally as the name "item-*". Only `*` works as a universal selector:

```css
/* ✗ Does NOT match item-1, item-2, etc. */
::view-transition-old(item-*) { ... }

/* ✓ Matches ALL view-transition groups */
::view-transition-old(*) { ... }
```

#### The `*` selector matches `root`

By default, View Transitions captures the entire page as a group called `root`. The `*` selector matches this too, causing the whole page to animate. You must explicitly disable root:

```css
::view-transition-old(root),
::view-transition-new(root) {
  animation: none !important;
}
```

#### Timing is critical

Setting `view-transition-name` in `turbo:before-render` doesn't work reliably because Turbo has already started its View Transition by the time this event fires. The "before" snapshot is captured without your styles.

#### The solution: Take control of View Transitions

The working approach:

1. **Detect changes** using `textContent` comparison (generic, no app-specific selectors)
2. **Prevent Turbo's default render** with `event.preventDefault()`
3. **Set view-transition-name on OLD elements** before starting the transition
4. **Call `document.startViewTransition()` ourselves**
5. **Inside the callback**, set names on NEW elements and call `event.detail.resume()`
6. **Clean up** after `transition.finished`

```javascript
document.addEventListener("turbo:before-render", (event) => {
  if (!event.detail.newBody) return
  if (!document.startViewTransition) return

  // Build maps of elements with data-view-transition-id
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

  // Detect creates, deletes, and modifications
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

  // Take control of the View Transition
  event.preventDefault()

  // Set view-transition-name on OLD elements BEFORE starting transition
  toAnimate.forEach(({ id, oldEl }) => {
    if (oldEl) oldEl.style.viewTransitionName = id
  })

  // Start View Transition ourselves
  const transition = document.startViewTransition(() => {
    // Set view-transition-name on NEW elements
    toAnimate.forEach(({ id, newEl }) => {
      if (newEl) newEl.style.viewTransitionName = id
    })
    // Resume Turbo's render
    event.detail.resume()
  })

  // Clean up after transition
  transition.finished.then(() => {
    document.querySelectorAll('[data-view-transition-id]').forEach(el => {
      el.style.viewTransitionName = ''
    })
  })
})
```

#### CSS: Disable all, then opt-in

Structure CSS to disable everything first, then enable specific animations:

```css
/* Disable ALL default animations (prevents cross-fading) */
::view-transition-old(*),
::view-transition-new(*) {
  animation: none;
}

/* Deletes: only old exists - slide out */
::view-transition-old(*):only-child {
  animation: slide-out 0.4s ease-in-out forwards;
}

/* Creates: only new exists - slide in */
::view-transition-new(*):only-child {
  animation: slide-in 0.3s ease-out;
}

/* Modifications: both exist - hide old, highlight new */
::view-transition-old(*):not(:only-child) {
  animation: none;
  display: none;
}

::view-transition-new(*):not(:only-child) {
  animation: highlight 400ms ease-in-out;
}

/* Root must have NO animation - override everything above */
::view-transition-old(root),
::view-transition-new(root) {
  animation: none !important;
}
```

#### The `:only-child` trick

This is how we differentiate animation types:

- **Deletes**: Only `::view-transition-old` exists (element removed) → `:only-child` matches
- **Creates**: Only `::view-transition-new` exists (element added) → `:only-child` matches
- **Modifications**: Both exist (element changed) → `:not(:only-child)` matches

#### Using `data-view-transition-id` instead of inline styles

Instead of hardcoding `view-transition-name` in partials (which would animate ALL elements), use a data attribute:

```erb
<div id="<%= dom_id(item) %>"
     data-view-transition-id="item-<%= item.id %>">
```

JavaScript dynamically adds `view-transition-name` only to elements that actually changed, preventing unwanted animations on unchanged elements.

#### Why textContent comparison works

Using `textContent.trim()` for change detection is:
- **Generic** - No app-specific selectors or column names
- **Reliable** - Captures any visible text change (title edits, button state changes like "Done" → "Undo")
- **Safe** - Ignores hidden inputs like CSRF tokens that change on every request

#### Why `background-color` doesn't work for highlights

A non-obvious gotcha: animating `background-color` on View Transition pseudo-elements doesn't produce visible results.

**The reason**: `::view-transition-old` and `::view-transition-new` pseudo-elements contain **snapshot images** of the captured elements. When you animate `background-color`, you're changing the background *behind* the snapshot image—which is completely covered by the image itself.

```css
/* ✗ Won't be visible - background is behind the snapshot image */
@keyframes highlight {
  from { background-color: #ffff99; }
  to { background-color: #fff; }
}
```

**The solution**: Use `box-shadow` instead. It renders *around* the snapshot image and is fully visible:

```css
/* ✓ Visible - box-shadow renders around the snapshot */
@keyframes highlight {
  0%, 100% { box-shadow: none; }
  20% { box-shadow: 0 0 0 4px #ffff99, 0 0 12px #ffff99; }
}
```

Other properties that work on View Transition pseudo-elements:
- `opacity` - fades the entire snapshot
- `transform` - moves/scales/rotates the snapshot
- `filter` - applies effects like `brightness()` or `blur()` to the snapshot
- `box-shadow` / `outline` - renders around the snapshot

---

## Complete File Listing

For reference, here are the key files in our final implementation:

- `app/models/item.rb` - `broadcasts_refreshes_to :list` and validation
- `app/controllers/items_controller.rb` - redirect on success, `turbo_stream.replace` on error
- `app/views/items/_form.html.erb` - `data-turbo-stream-refresh-permanent` with inline errors
- `app/views/items/_edit_form.html.erb` - Edit form with same protection attribute
- `app/views/items/_item.html.erb` - `view-transition-name` for animations
- `app/javascript/application.js` - Custom event listeners for stream-refresh protection (see "Complete JavaScript Implementation" section above for the full code with all three flags)
- `app/assets/stylesheets/application.css` - View Transition animations

---

## References

- [Turbo Handbook: Page Refreshes](https://turbo.hotwired.dev/handbook/page_refreshes)
- [Turbo Handbook: Redirecting After Form Submission](https://turbo.hotwired.dev/handbook/drive#redirecting-after-a-form-submission)
- [Learn Hotwire: Form Redirects and Errors](https://learnhotwire.com/sections/turbo-drive/lessons/form-redirects-and-errors)
- [Turbo Source: morphing.js](https://github.com/hotwired/turbo/blob/main/src/core/morphing.js)
- [Turbo Source: stream_message_renderer.js](https://github.com/hotwired/turbo/blob/main/src/core/streams/stream_message_renderer.js)
- [Turbo Rails: Broadcastable](https://github.com/hotwired/turbo-rails/blob/main/app/models/concerns/turbo/broadcastable.rb)
- [View Transitions API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API)
- [Turbo 8 Morphing Deep Dive](https://radanskoric.com/articles/turbo-morphing-deep-dive)
