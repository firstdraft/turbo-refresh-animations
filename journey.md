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
- **Devise** for authentication
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

## Step 5: Conditional data-turbo-permanent

We examined `getPermanentElementMapForFragment` more closely:

```javascript
function getPermanentElementMapForFragment(fragment) {
  const permanentElementsInDocument = queryPermanentElementsAll(document.documentElement)
  for (const permanentElementInDocument of permanentElementsInDocument) {
    const { id } = permanentElementInDocument
    const elementInStream = getPermanentElementById(streamElement.templateElement.content, id)
    if (elementInStream) {
      permanentElementMap[id] = [permanentElementInDocument, elementInStream]
    }
  }
}
```

**Key insight**: For Bardo preservation to occur, **both** the existing document element **and** the incoming stream fragment must have `data-turbo-permanent` with matching IDs.

### Attempted Solution

Render the form differently based on context:

```erb
<%= f.text_field :title,
    data: { turbo_permanent: local_assigns.fetch(:preserve_input, false) || nil } %>
```

- Page renders with `preserve_input: true` → has `data-turbo-permanent`
- Controller response with `preserve_input: false` → no attribute

**Theory**: Since the stream fragment wouldn't have `data-turbo-permanent`, Bardo wouldn't preserve, and the form would be replaced.

### The Problem

This didn't work reliably for redirects. Page visits (not just morphs) also respect `data-turbo-permanent`, so the redirect still preserved the form.

---

## Step 6: turbo_stream.refresh from Controller

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

## Final Solution: Stimulus + data-turbo-permanent + Separate Error Container

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

## Key Learnings

### 1. data-turbo-permanent is powerful but broad

It protects elements during:
- Page morphs (broadcast refreshes)
- Regular Turbo visits (redirects, link clicks)
- Turbo Stream actions (replace, update, etc.)

There's no built-in way to say "protect during morphs but not during stream actions."

### 2. Turbo's request-id prevents duplicate processing

Broadcasts include a `request-id` that matches the initiating request. This prevents the submitting client from processing their own broadcast (avoiding double updates). But it also means you can't rely solely on broadcasts to update the initiating client—they need their own update path (typically a redirect). In practice: the broadcast updates *other* clients, the redirect updates *the submitter*.

### 3. The turbo:submit-end event is your friend

This event fires after a form submission completes, with `event.detail.success` indicating whether the response was successful. It's the perfect hook for client-side form handling that needs to differ between success and failure.

### 4. Separate concerns with multiple containers

When you need different update behaviors for different parts of a form:
- Put the part that should be protected in a `data-turbo-permanent` container
- Put updateable parts (errors, dynamic content) in separate containers outside

### 5. Sometimes a little Stimulus is the right answer

We initially tried to avoid Stimulus entirely, preferring pure Turbo Stream solutions. But a 14-line Stimulus controller elegantly solved what was becoming increasingly complex with pure Turbo. The right tool for the job.

### 6. Status codes matter with Turbo

Always use:
- `status: :unprocessable_entity` (422) for validation errors
- `status: :see_other` (303) for redirects after non-GET requests

---

## Complete File Listing

For reference, here are the key files in our final implementation:

- `app/models/item.rb` - broadcasts_refreshes_to
- `app/controllers/items_controller.rb` - redirect on success, turbo_stream on error
- `app/views/items/_form.html.erb` - data-turbo-permanent + Stimulus
- `app/views/items/_errors.html.erb` - error display
- `app/views/items/_item.html.erb` - view-transition-name
- `app/javascript/controllers/form_controller.js` - clear on success
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
