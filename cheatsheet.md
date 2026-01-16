# Turbo Refresh Animations Cheatsheet

Quick implementation guide for animating Turbo Refresh morphs with CSS class-based animations.

## Prerequisites

- Rails 8+ with Turbo
- A model using `broadcasts_refreshes_to`

## Step 1: Enable Morphing

Add to your layout's `<head>`:

```erb
<%= turbo_refreshes_with method: :morph, scroll: :preserve %>
```

## Step 2: Add the JavaScript

Add to `app/javascript/application.js`:

```javascript
import "@hotwired/turbo-rails"
import "controllers"

// ========== FORM PROTECTION ==========
// Protect elements with data-turbo-stream-refresh-permanent during morphs,
// EXCEPT the specific form the user is currently submitting.
let submittingFormId = null

document.addEventListener("turbo:submit-start", (event) => {
  const form = event.target
  const wrapper = form.closest('[data-turbo-stream-refresh-permanent]')
  submittingFormId = wrapper?.id || null
})

document.addEventListener("turbo:submit-end", (event) => {
  if (!event.detail.fetchResponse?.response?.redirected) {
    submittingFormId = null
  }
})

// ========== DELETE ANIMATIONS ==========
let pendingDeletions = new Map()

// For submitter: intercept click, animate, then proceed
document.addEventListener("click", (event) => {
  const link = event.target.closest('a[data-turbo-method="delete"]')
  if (!link) return

  const item = link.closest('[data-turbo-stream-refresh-delete-animation]')
  if (!item) return

  if (item.dataset.deleteAnimationDone) return

  event.preventDefault()
  event.stopPropagation()

  const animClass = item.dataset.turboStreamRefreshDeleteAnimation
  item.classList.add(animClass)
  item.addEventListener("animationend", () => {
    item.dataset.deleteAnimationDone = "true"
    link.click()
  }, { once: true })
}, { capture: true })

// ========== MORPH PROTECTION ==========
document.addEventListener("turbo:before-morph-element", (event) => {
  const el = event.target

  // Protect permanent elements, unless it's the form we're submitting
  if (el.hasAttribute("data-turbo-stream-refresh-permanent")) {
    if (el.id !== submittingFormId) {
      event.preventDefault()
      return
    }
  }

  // For other clients: animate deletion before removal
  const id = el.dataset?.turboStreamRefreshId
  const deleteAnim = el.dataset?.turboStreamRefreshDeleteAnimation
  if (id && deleteAnim && pendingDeletions.has(id)) {
    event.preventDefault()
    el.classList.add(deleteAnim)
    el.addEventListener("animationend", () => {
      el.remove()
      pendingDeletions.delete(id)
    }, { once: true })
  }
})

document.addEventListener("turbo:render", () => {
  submittingFormId = null
})

// ========== ANIMATIONS ==========
// Animate elements during Turbo morphs using CSS class-based animations.
// Elements opt-in via data attributes:
//   data-turbo-stream-refresh-id="unique-id" - identifies element for tracking
//   data-turbo-stream-refresh-content="value" - content to compare (optional)
//   data-turbo-stream-refresh-create-animation="class" - animation for new elements
//   data-turbo-stream-refresh-update-animation="class" - animation for modified elements
//   data-turbo-stream-refresh-delete-animation="class" - animation for removed elements

let pendingAnimations = []

function applyAnimation(el, animClass) {
  el.classList.add(animClass)
  el.addEventListener("animationend", () => el.classList.remove(animClass), { once: true })
}

document.addEventListener("turbo:before-render", (event) => {
  if (!event.detail.newBody) return

  const oldMap = new Map()
  document.querySelectorAll('[data-turbo-stream-refresh-id]').forEach(el => {
    oldMap.set(el.dataset.turboStreamRefreshId, {
      content: el.dataset.turboStreamRefreshContent || el.textContent.trim(),
      el: el,
      isPermanent: el.hasAttribute("data-turbo-stream-refresh-permanent")
    })
  })

  const newMap = new Map()
  event.detail.newBody.querySelectorAll('[data-turbo-stream-refresh-id]').forEach(el => {
    newMap.set(el.dataset.turboStreamRefreshId, {
      content: el.dataset.turboStreamRefreshContent || el.textContent.trim(),
      createAnim: el.dataset.turboStreamRefreshCreateAnimation,
      updateAnim: el.dataset.turboStreamRefreshUpdateAnimation
    })
  })

  pendingAnimations = []
  pendingDeletions = new Map()

  // Deletions: in old but not new
  oldMap.forEach((oldData, id) => {
    if (!newMap.has(id) && oldData.el.dataset.turboStreamRefreshDeleteAnimation) {
      pendingDeletions.set(id, true)
    }
  })

  // Creates: in new but not old
  newMap.forEach((newData, id) => {
    if (!oldMap.has(id) && newData.createAnim) {
      pendingAnimations.push({ id, animClass: newData.createAnim })
    }
  })

  // Modifications: in both but content differs
  oldMap.forEach((oldData, id) => {
    if (newMap.has(id)) {
      const newData = newMap.get(id)
      if (oldData.content !== newData.content && newData.updateAnim) {
        if (oldData.isPermanent && oldData.el.id !== submittingFormId) {
          applyAnimation(oldData.el, newData.updateAnim)
        } else {
          pendingAnimations.push({ id, animClass: newData.updateAnim })
        }
      }
    }
  })
})

document.addEventListener("turbo:render", () => {
  pendingAnimations.forEach(({ id, animClass }) => {
    const el = document.querySelector(`[data-turbo-stream-refresh-id="${id}"]`)
    if (el) {
      applyAnimation(el, animClass)
    }
  })
  pendingAnimations = []
})
```

## Step 3: Add the CSS

```css
@keyframes flash-green {
  0%, 100% { box-shadow: none; }
  20% { box-shadow: 0 0 0 4px #d4edda, 0 0 12px #28a745; }
}

@keyframes flash-yellow {
  0%, 100% { box-shadow: none; }
  20% { box-shadow: 0 0 0 4px #ffff99, 0 0 12px #ffff99; }
}

@keyframes fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

.flash-green {
  animation: flash-green 400ms ease-in-out;
  position: relative;
  z-index: 1;
}

.flash-yellow {
  animation: flash-yellow 400ms ease-in-out;
  position: relative;
  z-index: 1;
}

.fade-out {
  animation: fade-out 300ms ease-out forwards;
}
```

## Step 4: Mark Elements to Animate

Add data attributes to elements you want animated:

```erb
<%# app/views/items/_item.html.erb %>
<div id="<%= dom_id(item) %>"
     data-turbo-stream-refresh-id="<%= dom_id(item) %>"
     data-turbo-stream-refresh-content="<%= [item.title, item.completed].join('|') %>"
     data-turbo-stream-refresh-create-animation="flash-green"
     data-turbo-stream-refresh-update-animation="flash-yellow"
     data-turbo-stream-refresh-delete-animation="fade-out">
  <%= item.title %>
  <!-- ... -->
</div>
```

**Important**:
- `data-turbo-stream-refresh-id` must be unique and stable
- `data-turbo-stream-refresh-content` prevents false positives when comparing different views of the same data (e.g., item display vs edit form)

## Step 5: Protect Forms from Broadcast Morphs

Add `data-turbo-stream-refresh-permanent` to forms that should be preserved during broadcasts:

```erb
<%# app/views/items/_form.html.erb (new item form) %>
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

```erb
<%# app/views/items/_edit_form.html.erb %>
<div id="<%= dom_id(item) %>"
     data-turbo-stream-refresh-id="<%= dom_id(item) %>"
     data-turbo-stream-refresh-content="<%= [item.title, item.completed].join('|') %>"
     data-turbo-stream-refresh-permanent
     data-turbo-stream-refresh-update-animation="flash-yellow">
  <%= form_with model: [item.list, item] do |f| %>
    <%= f.text_field :title %>
    <%= f.submit "Save" %>
  <% end %>
</div>
```

## Step 6: Controller Pattern

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

def destroy
  @item.destroy
  redirect_to @list, status: :see_other
end
```

## How It Works

| Animation | Trigger | CSS Class |
|-----------|---------|-----------|
| Create | Element in new DOM but not old | `flash-green` |
| Update | Element in both, content differs | `flash-yellow` |
| Delete | Element in old DOM but not new | `fade-out` |

| Scenario | Form Behavior |
|----------|---------------|
| User submits successfully | Redirect → form clears normally |
| User submits with errors | `turbo_stream.replace` → errors display |
| Another user triggers refresh | Form protected → typing preserved |
| Another user modifies same item | Protected form flashes yellow |

## Quick Reference

| Attribute | Purpose |
|-----------|---------|
| `data-turbo-stream-refresh-id` | Unique identifier for tracking |
| `data-turbo-stream-refresh-content` | Content value for comparison (avoids false positives) |
| `data-turbo-stream-refresh-permanent` | Protect during broadcast morphs |
| `data-turbo-stream-refresh-create-animation` | CSS class for new elements |
| `data-turbo-stream-refresh-update-animation` | CSS class for modified elements |
| `data-turbo-stream-refresh-delete-animation` | CSS class for removed elements |

## Troubleshooting

### Form doesn't clear after submission
- Verify controller uses `redirect_to` with `status: :see_other`
- Ensure the form wrapper has a unique `id` attribute

### Form clears when OTHER users submit
- Add `data-turbo-stream-refresh-permanent` to the form wrapper
- Ensure the wrapper has a unique `id`

### Edit form flashes when new item added
- Add `data-turbo-stream-refresh-content` to both item and edit form
- Use the same content value (e.g., `item.title|item.completed`)

### Delete animation doesn't show for submitter
- The click handler uses capture phase - ensure it loads before Turbo
- Check that the delete link has `data-turbo-method="delete"`

### Animation clipped by sibling elements
- Add `position: relative; z-index: 1;` to animation classes
