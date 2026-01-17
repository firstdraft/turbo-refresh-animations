# Turbo Refresh Animations

CSS class-based animations for [Turbo](https://turbo.hotwired.dev/) page refresh morphs. Animates elements when they're created, changed, or deleted during Turbo morphs.

**Features:**
- Opt-in animations via `data-turbo-refresh-animate` attribute
- Animate creates, changes, and deletes
- Protect elements (especially forms) from being morphed during broadcast refreshes
- Customize animations via CSS classes or CSS variables
- Works with importmaps, esbuild, webpack, or any bundler

## Installation

### With importmaps (Rails 7+)

```bash
bin/importmap pin turbo-refresh-animations
```

### With npm/yarn

```bash
npm install turbo-refresh-animations
# or
yarn add turbo-refresh-animations
```

## Quick Start

### 1. Import the library

```javascript
// app/javascript/application.js
import "@hotwired/turbo-rails"
import "turbo-refresh-animations"
```

### 2. Import the CSS

```css
/* app/assets/stylesheets/application.css */
@import "turbo-refresh-animations/turbo-refresh-animations.css";
```

Or with Rails asset pipeline, add to your layout:

```erb
<%= stylesheet_link_tag "turbo-refresh-animations" %>
```

### 3. Enable morphing in your layout

```erb
<%# app/views/layouts/application.html.erb %>
<head>
  <%= turbo_refreshes_with method: :morph, scroll: :preserve %>
</head>
```

### 4. Opt in elements for animations

Add `data-turbo-refresh-animate` and an `id` to elements you want to animate:

```erb
<%# app/views/items/_item.html.erb %>
<div id="<%= dom_id(item) %>" data-turbo-refresh-animate>
  <%= item.title %>
</div>
```

Elements will animate when created, changed, or deleted during Turbo morphs.

## How It Works

The library uses a MutationObserver to detect actual DOM changes during Turbo morphs. Only elements with both an `id` and the `data-turbo-refresh-animate` attribute will be animated:

| Animation | Trigger | Default Class |
|-----------|---------|---------------|
| Enter | New element added to DOM | `turbo-refresh-enter` |
| Change | Element content/attributes change | `turbo-refresh-change` |
| Exit | Element removed from DOM | `turbo-refresh-exit` |

## Protecting Elements During Broadcasts

### `data-turbo-stream-refresh-permanent`

When using `broadcasts_refreshes_to` for real-time updates, any element with this attribute will be protected from morphing during broadcast-triggered refreshes. This is useful for any element whose current DOM state you want to preserve when other users' actions trigger a page refresh.

```erb
<div id="my_element" data-turbo-stream-refresh-permanent>
  <!-- This element won't be morphed during broadcasts -->
</div>
```

**The most common use case is forms.** Without protection, a user typing in a form would lose their input whenever another user's action triggers a broadcast refresh:

```erb
<div id="new_item_form" data-turbo-stream-refresh-permanent>
  <%= form_with model: [list, item] do |f| %>
    <%= f.text_field :title %>
    <%= f.submit "Add" %>
  <% end %>
</div>
```

### Form-specific conveniences

Since forms are the most common use case, the library includes special handling:

1. **Submitter's form still clears**: When a user submits a form inside a protected element, that specific element is allowed to morph normally (so the form clears after submission via the redirect response). Other protected elements remain protected.

2. **Non-blank inputs preserved during navigation**: Even during user-initiated navigation (not just broadcasts), elements with `data-turbo-stream-refresh-permanent` that contain non-blank form inputs will be protected. This preserves the user's work-in-progress if they accidentally navigate away.

### Flash protected elements on update

To show a visual indicator when a protected element's underlying data changes (e.g., another user edits the same item), add `data-turbo-refresh-version`:

```erb
<div id="<%= dom_id(item) %>"
     data-turbo-stream-refresh-permanent
     data-turbo-refresh-animate
     data-turbo-refresh-version="<%= item.cache_key_with_version %>">
  <%= form_with model: [item.list, item] do |f| %>
    <%= f.text_field :title %>
    <%= f.submit "Save" %>
  <% end %>
</div>
```

When the version changes during a broadcast, the element flashes with the change animation while keeping its current content protected.

## Customization

### Override colors via CSS variables

```css
:root {
  --turbo-refresh-enter-bg: #D1E7DD;  /* green */
  --turbo-refresh-exit-bg: #F8D7DA;   /* red */
  --turbo-refresh-change-bg: #FFF3CD; /* yellow */
}
```

### Disable specific animations

Opt out of individual animation types per element:

```erb
<div id="<%= dom_id(item) %>"
     data-turbo-refresh-animate
     data-turbo-refresh-enter="none">
  <!-- No enter animation, but exit and change still work -->
</div>
```

Options: `data-turbo-refresh-enter="none"`, `data-turbo-refresh-exit="none"`, `data-turbo-refresh-change="none"`

### Define your own animations

Override the default CSS classes. Here's an example using box-shadow glow effects:

```css
/* Enter - green glow */
@keyframes turbo-refresh-enter {
  0%, 100% { box-shadow: none; }
  20% { box-shadow: 0 0 0 4px #D1E7DD, 0 0 12px #28a745; }
}

.turbo-refresh-enter {
  animation: turbo-refresh-enter 400ms ease-in-out;
}

/* Change - yellow glow */
@keyframes turbo-refresh-change {
  0%, 100% { box-shadow: none; }
  20% { box-shadow: 0 0 0 4px #FFF3CD, 0 0 12px #ffc107; }
}

.turbo-refresh-change {
  animation: turbo-refresh-change 400ms ease-in-out;
}

/* Exit - fade out */
@keyframes turbo-refresh-exit {
  from { opacity: 1; }
  to { opacity: 0; }
}

.turbo-refresh-exit {
  animation: turbo-refresh-exit 300ms ease-out forwards;
}
```

### Default animations

The included CSS provides these defaults:

- **Enter**: Green background fade (1.2s)
- **Change**: Yellow background fade (1.2s)
- **Exit**: Red background fade with opacity (0.6s)

## Data Attributes Reference

| Attribute | Purpose |
|-----------|---------|
| `id` | Element identifier (required) |
| `data-turbo-refresh-animate` | Opt-in element for animations |
| `data-turbo-refresh-enter="none"` | Disable enter animation |
| `data-turbo-refresh-change="none"` | Disable change animation |
| `data-turbo-refresh-exit="none"` | Disable exit animation |
| `data-turbo-stream-refresh-permanent` | Protect element during broadcast morphs |
| `data-turbo-refresh-version` | Version string for change detection on protected elements |

## Example: Todo List Item

```erb
<%# app/views/items/_item.html.erb %>
<div id="<%= dom_id(item) %>"
     class="list-item"
     data-turbo-refresh-animate>
  <span><%= item.title %></span>
  <%= button_to "Delete", item, method: :delete %>
</div>
```

## Example: Edit Form with Protection

```erb
<%# app/views/items/_edit_form.html.erb %>
<div id="<%= dom_id(item) %>"
     data-turbo-stream-refresh-permanent
     data-turbo-refresh-animate
     data-turbo-refresh-version="<%= item.cache_key_with_version %>">
  <%= form_with model: item do |f| %>
    <%= f.text_field :title %>
    <%= f.submit "Save" %>
    <%= link_to "Cancel", items_path %>
  <% end %>
</div>
```

## Browser Support

Works in all browsers that support Turbo 8+ (modern browsers).

## License

MIT
