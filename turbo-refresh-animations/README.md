# Turbo Refresh Animations

CSS class-based animations for [Turbo](https://turbo.hotwired.dev/) page refresh morphs. Automatically animates elements when they're created, updated, or deleted during Turbo morphs.

**Features:**
- 🎬 Animate elements on create, update, and delete
- 🛡️ Protect forms from being cleared during broadcast refreshes
- 🎨 Use your own CSS animation classes
- 📦 Zero dependencies (just requires Turbo 8+)
- ⚡ Works with importmaps, esbuild, webpack, or any bundler

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

### With CDN

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/turbo-refresh-animations"></script>
```

## Setup

### 1. Import the library

```javascript
// app/javascript/application.js
import "@hotwired/turbo-rails"
import "turbo-refresh-animations"
```

That's it! The library auto-initializes when imported.

### 2. Enable morphing in your layout

```erb
<%# app/views/layouts/application.html.erb %>
<head>
  <%= turbo_refreshes_with method: :morph, scroll: :preserve %>
</head>
```

### 3. Add CSS animations

Use the included example styles or write your own:

```css
/* Option A: Import the included styles */
@import "turbo-refresh-animations/style.css";

/* Option B: Write your own */
@keyframes flash-green {
  0%, 100% { box-shadow: none; }
  20% { box-shadow: 0 0 0 4px #d4edda, 0 0 12px #28a745; }
}

.flash-green {
  animation: flash-green 400ms ease-in-out;
}
```

### 4. Mark elements to animate

```erb
<div id="<%= dom_id(item) %>"
     data-turbo-refresh-id="<%= dom_id(item) %>"
     data-turbo-refresh-enter-class="flash-green"
     data-turbo-refresh-update-class="flash-yellow"
     data-turbo-refresh-exit-class="fade-out">
  <%= item.title %>
</div>
```

## Data Attributes

| Attribute | Required | Description |
|-----------|----------|-------------|
| `data-turbo-refresh-id` | Yes | Unique identifier to track element across morphs |
| `data-turbo-refresh-version` | No | Version value for change detection (e.g., `updated_at.to_i`) |
| `data-turbo-refresh-permanent` | No | Protect element during broadcast morphs |
| `data-turbo-refresh-enter-class` | No | CSS class to apply when element is created |
| `data-turbo-refresh-update-class` | No | CSS class to apply when element is modified |
| `data-turbo-refresh-exit-class` | No | CSS class to apply when element is deleted |

## Examples

### Basic item with all animations

```erb
<%# app/views/items/_item.html.erb %>
<div id="<%= dom_id(item) %>"
     data-turbo-refresh-id="<%= dom_id(item) %>"
     data-turbo-refresh-enter-class="flash-green"
     data-turbo-refresh-update-class="flash-yellow"
     data-turbo-refresh-exit-class="fade-out">
  <%= item.title %>
</div>
```

### Protected form (won't clear during broadcasts)

```erb
<%# app/views/items/_form.html.erb %>
<div id="new_item_form" data-turbo-refresh-permanent>
  <%= form_with model: [list, item] do |f| %>
    <%= f.text_field :title %>
    <%= f.submit "Add" %>
  <% end %>
</div>
```

### Edit form with update animation

When another user modifies the same item, the edit form flashes to alert the user:

```erb
<%# app/views/items/_edit_form.html.erb %>
<div id="<%= dom_id(item) %>"
     data-turbo-refresh-id="<%= dom_id(item) %>"
     data-turbo-refresh-version="<%= item.updated_at.to_i %>"
     data-turbo-refresh-permanent
     data-turbo-refresh-update-class="flash-yellow">
  <%= form_with model: [item.list, item] do |f| %>
    <%= f.text_field :title %>
    <%= f.submit "Save" %>
  <% end %>
</div>
```

### Using `data-turbo-refresh-version`

Use `data-turbo-refresh-version` to detect when underlying data has changed. The simplest approach is to use the record's `updated_at` timestamp:

```erb
data-turbo-refresh-version="<%= item.updated_at.to_i %>"
```

This triggers update animations only when the database record has actually been modified.

## How It Works

1. **On `turbo:before-render`**: Compares old and new DOM to detect creates, updates, and deletes
2. **On `turbo:before-morph-element`**: Protects permanent elements and handles exit animations
3. **On `turbo:render`**: Applies enter and update animations to the new DOM

### Animation Timing

- **Enter/Update**: Applied after the DOM updates (element is new)
- **Exit**: Applied before removal, element is removed after `animationend`
- **Protected elements**: Animated immediately (element doesn't change)

## Controller Pattern

```ruby
class ItemsController < ApplicationController
  def create
    @item = @list.items.build(item_params)
    if @item.save
      redirect_to @list, status: :see_other  # Triggers morph with animations
    else
      render turbo_stream: turbo_stream.replace("new_item_form", ...)
    end
  end

  def destroy
    @item.destroy
    redirect_to @list, status: :see_other  # Exit animation plays first
  end
end
```

## Included CSS Classes

Import `turbo-refresh-animations/style.css` for these ready-to-use classes:

| Class | Animation | Good for |
|-------|-----------|----------|
| `turbo-refresh-flash-green` | Green glow | Creates |
| `turbo-refresh-flash-yellow` | Yellow glow | Updates |
| `turbo-refresh-fade-out` | Fade out | Deletes |
| `turbo-refresh-slide-in` | Slide down + fade in | Creates |
| `turbo-refresh-slide-out` | Slide down + fade out | Deletes |

## Browser Support

Works in all browsers that support Turbo 8+ (modern browsers).

## License

MIT
