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
/* or */
@import "turbo-refresh-animations/style.css";
```

Without a CSS bundler, copy `node_modules/turbo-refresh-animations/turbo-refresh-animations.css` into your app and include it as usual.

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
| Change | Element text changes (or version changes) | `turbo-refresh-change` |
| Exit | Element removed from DOM | `turbo-refresh-exit` |

### Change Detection

By default, change animations run only when an element's normalized `textContent` differs between the old and new page. This naturally ignores most "noise" that isn't user-visible (CSRF tokens, framework attributes, etc.).

Normalization collapses all whitespace to single spaces and trims leading/trailing whitespace.

For precise control (and to count non-text changes as meaningful), use `data-turbo-refresh-version`:

```erb
<div id="<%= dom_id(item) %>"
     data-turbo-refresh-animate
     data-turbo-refresh-version="<%= item.cache_key_with_version %>">
  <%= item.title %>
  <%= button_to "Delete", item, method: :delete %>
</div>
```

When `data-turbo-refresh-version` is present, it's used instead of `textContent` to decide whether a change is meaningful. This is useful when:

- Elements contain forms with CSRF tokens (via `button_to`)
- Elements include dynamic attributes from JavaScript frameworks
- You want explicit control over what constitutes a "change"

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

Note: protected elements can temporarily be in a different "view state" than the server-rendered HTML (e.g., an open edit form vs a read-only item view). To avoid false positives, the library only flashes protected elements based on `data-turbo-refresh-version` from the incoming HTML. In practice, add `data-turbo-refresh-version` to all render variants of a given `id` if you want flashing to work reliably.

## Customization

### Override colors via CSS variables

```css
:root {
  --turbo-refresh-enter-bg: #D1E7DD;  /* green */
  --turbo-refresh-exit-bg: #F8D7DA;   /* red */
  --turbo-refresh-change-bg: #FFF3CD; /* yellow */
}
```

### Tune durations and easing

```css
:root {
  --turbo-refresh-enter-duration: 600ms;
  --turbo-refresh-change-duration: 600ms;
  --turbo-refresh-exit-duration: 400ms;
  --turbo-refresh-easing: ease-out;
}
```

### Custom animation classes per element

Use a different animation class for specific elements:

```erb
<div id="<%= dom_id(item) %>"
     data-turbo-refresh-animate
     data-turbo-refresh-enter="my-custom-enter"
     data-turbo-refresh-exit="my-custom-exit">
  <!-- Uses my-custom-enter and my-custom-exit instead of defaults -->
</div>
```

### Disable specific animations

Opt out of individual animation types per element:

```erb
<div id="<%= dom_id(item) %>"
     data-turbo-refresh-animate
     data-turbo-refresh-enter-off>
  <!-- No enter animation, but exit and change still work -->
</div>
```

Options: `data-turbo-refresh-enter-off`, `data-turbo-refresh-exit-off`, `data-turbo-refresh-change-off`

Note: `-off` attributes take precedence over custom class attributes.

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

- **Enter**: Green background fade (`--turbo-refresh-enter-duration`, default 1.2s)
- **Change**: Yellow background fade (`--turbo-refresh-change-duration`, default 1.2s)
- **Exit**: Red background fade with opacity (`--turbo-refresh-exit-duration`, default 0.6s)

Animations automatically reduce for users with `prefers-reduced-motion: reduce`.

## Data Attributes Reference

| Attribute | Purpose |
|-----------|---------|
| `id` | Element identifier (required) |
| `data-turbo-refresh-animate` | Opt-in element for animations |
| `data-turbo-refresh-enter="class"` | Custom enter animation class |
| `data-turbo-refresh-change="class"` | Custom change animation class |
| `data-turbo-refresh-exit="class"` | Custom exit animation class |
| `data-turbo-refresh-enter-off` | Disable enter animation |
| `data-turbo-refresh-change-off` | Disable change animation |
| `data-turbo-refresh-exit-off` | Disable exit animation |
| `data-turbo-stream-refresh-permanent` | Protect element during broadcast morphs |
| `data-turbo-refresh-version` | Override change detection (used instead of `textContent`, e.g. `item.cache_key_with_version`) |

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
