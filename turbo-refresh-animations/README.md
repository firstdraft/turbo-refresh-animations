# Turbo Refresh Animations

CSS class-based animations for [Turbo](https://turbo.hotwired.dev/) page refresh morphs. Animates elements when they're created, updated, or deleted during Turbo morphs.

**Features:**
- Opt-in animations via `data-turbo-refresh-animate` attribute
- Animate creates, updates, and deletes
- Protect forms from being cleared during broadcast refreshes
- Preserve user input during navigation
- Customize animations via CSS classes
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
@import "turbo-refresh-animations/style.css";
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

Elements will animate when created, updated, or deleted during Turbo morphs.

## How It Works

The library uses a MutationObserver to detect actual DOM changes during Turbo morphs. Only elements with both an `id` and the `data-turbo-refresh-animate` attribute will be animated:

| Animation | Trigger | Default Class |
|-----------|---------|---------------|
| Enter | New element added to DOM | `turbo-refresh-enter` |
| Update | Element content/attributes change | `turbo-refresh-update` |
| Exit | Element removed from DOM | `turbo-refresh-exit` |

## Form Protection

### Protect forms during broadcasts

When using `broadcasts_refreshes_to` for real-time updates, forms can get cleared when other users trigger refreshes. Protect forms with `data-turbo-stream-refresh-permanent`:

```erb
<div id="new_item_form" data-turbo-stream-refresh-permanent>
  <%= form_with model: [list, item] do |f| %>
    <%= f.text_field :title %>
    <%= f.submit "Add" %>
  <% end %>
</div>
```

**Behavior:**
- During broadcast refreshes: Form is protected (not morphed)
- After form submission: Form clears normally via redirect
- During navigation with non-blank inputs: Form is preserved

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

When the version changes during a broadcast, the element flashes with the update animation while keeping its current content protected.

## Customization

### Define your own animations

Override the default CSS classes:

```css
.turbo-refresh-enter {
  animation: my-enter-animation 300ms ease-out;
}

.turbo-refresh-update {
  animation: my-update-animation 300ms ease-out;
}

.turbo-refresh-exit {
  animation: my-exit-animation 300ms ease-out forwards;
}
```

### Default animations

The included `style.css` provides these defaults:

- **Enter**: Green glow/flash effect (400ms)
- **Update**: Yellow glow/flash effect (400ms)
- **Exit**: Fade out with red background (800ms)

## Data Attributes Reference

| Attribute | Purpose |
|-----------|---------|
| `id` | Element identifier (required) |
| `data-turbo-refresh-animate` | Opt-in element for animations |
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
