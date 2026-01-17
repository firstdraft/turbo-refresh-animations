# Turbo Refresh Animations

CSS class-based animations for [Turbo](https://turbo.hotwired.dev/) page refresh morphs. Automatically animates elements when they're created, updated, or deleted during Turbo morphs.

**Features:**
- Zero configuration - works automatically with elements that have `id` attributes
- Animate creates, updates, and deletes
- Protect forms from being cleared during broadcast refreshes
- Customize animations via CSS or data attributes
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

### 4. Use `id` attributes on your elements

```erb
<%# app/views/items/_item.html.erb %>
<div id="<%= dom_id(item) %>">
  <%= item.title %>
</div>
```

That's it! Elements will automatically animate when created, updated, or deleted.

## How It Works

The library tracks elements by their `id` attribute and detects changes during Turbo morphs:

| Animation | Trigger | Default Class |
|-----------|---------|---------------|
| Enter | Element appears (new `id` in DOM) | `turbo-refresh-enter` |
| Update | Element content changes | `turbo-refresh-update` |
| Exit | Element removed (`id` no longer in DOM) | `turbo-refresh-exit` |

## Customization

### Override animation classes per element

```erb
<div id="<%= dom_id(item) %>"
     data-turbo-refresh-enter-class="my-custom-enter"
     data-turbo-refresh-update-class="my-custom-update"
     data-turbo-refresh-exit-class="my-custom-exit">
  <%= item.title %>
</div>
```

### Define your own default animations

Instead of importing the provided CSS, define your own:

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

### Protect forms from broadcast morphs

Add `data-turbo-refresh-permanent` to forms that should be preserved when other users trigger refreshes:

```erb
<div id="new_item_form" data-turbo-refresh-permanent>
  <%= form_with model: [list, item] do |f| %>
    <%= f.text_field :title %>
    <%= f.submit "Add" %>
  <% end %>
</div>
```

The form will be protected during broadcast refreshes but will still update normally after its own submission.

## Data Attributes Reference

| Attribute | Purpose |
|-----------|---------|
| `id` | Element identifier (required for animations) |
| `data-turbo-refresh-id` | Override element identifier (optional) |
| `data-turbo-refresh-permanent` | Protect element during broadcast morphs |
| `data-turbo-refresh-enter-class` | Override enter animation class |
| `data-turbo-refresh-update-class` | Override update animation class |
| `data-turbo-refresh-exit-class` | Override exit animation class |

## Included CSS Classes

The `style.css` file includes these ready-to-use classes:

| Class | Animation | Good for |
|-------|-----------|----------|
| `turbo-refresh-enter` | Green flash (default) | Creates |
| `turbo-refresh-update` | Yellow flash (default) | Updates |
| `turbo-refresh-exit` | Fade out (default) | Deletes |
| `turbo-refresh-flash-green` | Green flash | Creates |
| `turbo-refresh-flash-yellow` | Yellow flash | Updates |
| `turbo-refresh-fade-out` | Fade out | Deletes |
| `turbo-refresh-slide-in` | Slide down + fade in | Creates |
| `turbo-refresh-slide-out` | Slide down + fade out | Deletes |

## Browser Support

Works in all browsers that support Turbo 8+ (modern browsers).

## License

MIT
