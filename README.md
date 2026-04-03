# Turbo Refresh Animations

Animates elements that enter, exit, or change during [Turbo Page Refreshes](https://turbo.hotwired.dev/handbook/page_refreshes).

**Features:**

- Opt-in animations via `data-turbo-refresh-animate` attribute.
- Animates entries, exits, and changes.
- Preserve elements (especially forms) during external refresh morphs; your own actions still morph through.
- Customize animations via CSS classes.
- Works with importmaps, esbuild, webpack, or any bundler.

## Table of Contents

- [Installation](#installation)
  - [With importmaps (Rails 7+)](#with-importmaps-rails-7)
  - [With npm/yarn](#with-npmyarn)
- [Quick Start](#quick-start)
  - [1. Import the library](#1-import-the-library)
  - [2. Add the CSS](#2-add-the-css)
  - [3. Enable morphing in your layout](#3-enable-morphing-in-your-layout)
  - [4. Opt in elements for animations](#4-opt-in-elements-for-animations)
- [Data Attributes Reference](#data-attributes-reference)
- [How It Works](#how-it-works)
  - [Change Detection](#change-detection)
- [Preserving Elements During External Refreshes](#preserving-elements-during-external-refreshes)
  - [`data-turbo-refresh-preserve`](#data-turbo-refresh-preserve)
  - [Form-specific conveniences](#form-specific-conveniences)
  - [Flash preserved elements on update](#flash-preserved-elements-on-update)
- [Common Gotchas](#common-gotchas)
  - [Turbo Stream templates and form redirects](#turbo-stream-templates-and-form-redirects)
  - [Duplicate IDs cause scroll jumps during morphs](#duplicate-ids-cause-scroll-jumps-during-morphs)
- [Customization](#customization)
  - [Custom animation classes per element](#custom-animation-classes-per-element)
  - [Enable specific animations](#enable-specific-animations)
  - [Define your own animations](#define-your-own-animations)
  - [Example animations](#example-animations)
- [Refresh Deduping Notes](#refresh-deduping-notes)
- [Disabling the Turbo Progress Bar](#disabling-the-turbo-progress-bar)
- [Experimental: Position Animations (FLIP)](#experimental-position-animations-flip)
- [TODOs](#todos)
- [License](#license)

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

Peer dependency: `@hotwired/turbo` >= 8. If you're using Rails with `turbo-rails`, it's already included; otherwise install `@hotwired/turbo` alongside this package.

## Quick Start

### 1. Import the library

```javascript
// app/javascript/application.js
import "@hotwired/turbo-rails"
import "turbo-refresh-animations"
```

### 2. Add the CSS

Add CSS for the animation classes in your app's stylesheet. This package does not ship visual CSS — you define your own animations. Copy the example styles from the [Example animations](#example-animations) section or write your own.

The library does inject one functional CSS rule (`overflow-anchor: none` on animated elements) to prevent the browser's [scroll anchoring](https://developer.mozilla.org/en-US/docs/Web/CSS/overflow-anchor) from following elements that move upward in the DOM during morphs. You can override this in your own stylesheet if needed.

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

## Data Attributes Reference

| Attribute | Purpose |
|-----------|---------|
| `id` | Element identifier (required for enter/change/exit animations) |
| `data-turbo-refresh-animate` | Opt-in for animations (`=""`/present enables all, `="enter,exit"` enables subset, `="none"` disables) |
| `data-turbo-refresh-enter="class"` | Custom enter animation class (single class token; no spaces) |
| `data-turbo-refresh-change="class"` | Custom change animation class (single class token; no spaces) |
| `data-turbo-refresh-exit="class"` | Custom exit animation class (single class token; no spaces) |
| `data-turbo-refresh-preserve` | Preserve element during external refresh morphs (your own actions still morph through) |
| `data-turbo-refresh-move` | Opt-in for FLIP position animations when an element moves during a morph |
| `data-turbo-refresh-version` | Override change detection (used instead of `textContent`, e.g. `item.cache_key_with_version`) |

## How It Works

The library compares each element's "meaningful signature" before and after Turbo renders a page refresh morph. Elements with both an `id` and the `data-turbo-refresh-animate` attribute will be animated:

| Animation | Trigger | Default CSS class |
|-----------|---------|-------------------|
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

- The element contains invisible changes like hidden inputs (e.g. CSRF tokens) or attributes.
- Elements include dynamic attributes from JavaScript frameworks.
- You want explicit control over what constitutes a "change".

## Preserving Elements During External Refreshes

### `data-turbo-refresh-preserve`

When multiple users collaborate on the same page via `broadcasts_refreshes_to`, another user's action can trigger a refresh morph that disrupts the current user's DOM state (e.g., clears a form they're typing in, closes an inline edit form they have open). Add `data-turbo-refresh-preserve` to tell the library to preserve that element's state during external refreshes:

```erb
<div data-turbo-refresh-preserve>
  <!-- Preserved during other users' refreshes; your own actions morph through -->
</div>
```

Unlike Turbo's `data-turbo-permanent`, this is conditional: the element morphs normally when it contains the form submit or link click that initiated the refresh. Only external refreshes are blocked.

This does not require an `id` (unless you also want the element to participate in enter/change/exit animations).

**The most common use case is forms.** Without preservation, a user typing in a form would lose their input whenever another user's action triggers a refresh:

```erb
<div id="new_item_form" data-turbo-refresh-preserve>
  <%= form_with model: item do |f| %>
    <%= f.text_field :title %>
    <%= f.submit "Add" %>
  <% end %>
</div>
```

### Form-specific conveniences

Since forms are the most common use case, the library includes special handling:

1. **Submitter's form still clears**: When a user submits a form inside a preserved element, that specific element is allowed to morph normally (so the form clears after submission via the redirect response). Other preserved elements remain preserved.

2. **Same-page refreshes preserve state**: Even during refresh morphs that stay on the same URL (e.g., `redirect_to` back to the current page), elements with `data-turbo-refresh-preserve` stay preserved. This keeps user-created UI state like open edit forms. If a user clicks a same‑page link inside a preserved element (e.g., "Cancel"), the library sets `data-turbo-action="replace"` on that link so Turbo uses a refresh morph; the initiating element updates while other preserved elements remain open.
   - For this behavior, “same page” means the same `origin + pathname + search` (hash ignored).
   - Note: links to an anchor in the current document (e.g. `/lists/1#comments`) are treated as in-page navigation and are not forced into a refresh morph.

### Flash preserved elements on update

To show a visual indicator when a preserved element's underlying data changes (e.g., another user edits the same item), add `data-turbo-refresh-version`:

```erb
<div id="<%= dom_id(item) %>"
     data-turbo-refresh-preserve
     data-turbo-refresh-animate
     data-turbo-refresh-version="<%= item.cache_key_with_version %>">
  <%= form_with model: [item.list, item] do |f| %>
    <%= f.text_field :title %>
    <%= f.submit "Save" %>
  <% end %>
</div>
```

When the version changes during an external refresh, the element flashes with the change animation while keeping its current content preserved.

Note: preserved elements can temporarily be in a different "view state" than the server-rendered HTML (e.g., an open edit form vs a read-only item view). To avoid false positives, the library only flashes preserved elements based on `data-turbo-refresh-version` from the incoming HTML. In practice, add `data-turbo-refresh-version` to all render variants of a given `id` if you want flashing to work reliably.

## Common Gotchas

### Turbo Stream templates and form redirects

This library relies on full-page morphs to detect changes and animate elements. A common Rails gotcha can prevent morphs from happening on the initiating client:

When a form submits, Turbo adds `text/vnd.turbo-stream.html` to the request's `Accept` header. If the form submission redirects (e.g., `redirect_to @list, status: :see_other`), the browser's Fetch API [preserves the `Accept` header across the redirect](https://github.com/hotwired/turbo/issues/1018). If the redirect target has a `.turbo_stream.erb` template, Rails will render it instead of the HTML page. This means:

- No page morph happens (the response is a Turbo Stream, not HTML)
- The library can't detect enter/change/exit — no animations run
- The initiator's form doesn't clear (the morph that would clear it never happens)
- The broadcast refresh is deduped by request-id, so no morph follows

This is a [browser-level limitation](https://github.com/rails/rails/issues/45566), not a bug in Turbo or Rails. The Fetch API follows redirects internally, and there's no JavaScript hook to modify headers on the redirected request.

**Fix**: Don't put `.turbo_stream.erb` templates on actions that are also redirect targets. For example, if your `create` action does `redirect_to @list`, don't have a `lists/show.turbo_stream.erb`. Instead, use a separate action for inline Turbo Stream flows (e.g., a dedicated `cancel` action), or use the library's same-page link handling for Cancel links inside `data-turbo-refresh-preserve` elements (the library automatically sets `data-turbo-action="replace"` on same-page links inside preserved elements, which triggers a page refresh morph).

### Duplicate IDs cause scroll jumps during morphs

Turbo's morph engine (idiomorph) [loses scroll position when duplicate IDs exist on the page](https://github.com/hotwired/turbo/issues/1226), especially when the duplicated element is the one triggering the event. This is easy to create accidentally in Rails when rendering forms inside a loop:

```erb
<%# BAD: every item gets id="item_completed" %>
<% @items.each do |item| %>
  <%= form_with model: item do |f| %>
    <%= f.check_box :completed, onchange: "this.form.requestSubmit()" %>
  <% end %>
<% end %>
```

Rails' `check_box` helper auto-generates an `id` from the attribute name (`item_completed`), which is the same for every item. When any checkbox triggers a morph, the page jumps to the top.

**Fix**: Give each input a unique ID:

```erb
<%= f.check_box :completed, onchange: "this.form.requestSubmit()",
    id: dom_id(item, :completed) %>
```

## Customization

### Custom animation classes per element

Use a different animation class for specific elements:

```erb
<div id="<%= dom_id(item) %>"
     data-turbo-refresh-animate
     data-turbo-refresh-enter="my-custom-enter"
     data-turbo-refresh-exit="my-custom-exit">
  <!-- Uses my-custom-enter and my-custom-exit instead of the default class names -->
</div>
```

### Enable specific animations

By default, `data-turbo-refresh-animate` enables all three animation types. Specify a comma-separated list to enable only certain types:

```erb
<%# Only animate exits (no enter or change) %>
<div id="<%= dom_id(item) %>" data-turbo-refresh-animate="exit">

<%# Animate enter and exit (no change) %>
<div id="<%= dom_id(item) %>" data-turbo-refresh-animate="enter,exit">

<%# All animations (default) %>
<div id="<%= dom_id(item) %>" data-turbo-refresh-animate>
```

Options: `enter`, `exit`, `change`

To explicitly disable animations on an element, use `data-turbo-refresh-animate="none"` (or `"false"`). This can be useful when a helper emits the attribute automatically.

### Define your own animations

You can override the default class names or use custom class names per element.

If you already have an existing class you want the library to use by default, CSS doesn't provide true
"class aliasing", but you can get the same effect:

```css
/* Apply the same rules to both selectors */
.turbo-refresh-enter,
.my-enter {
  animation: myEnter 180ms ease-out;
}
```

If you use Sass/SCSS, you can also do:

```scss
/* Make .turbo-refresh-enter reuse .my-enter rules */
.turbo-refresh-enter { @extend .my-enter; }
```

Alternatively, set `data-turbo-refresh-enter="my-enter"` (or `...-change` / `...-exit`) on specific elements.

Exit animations can be implemented with CSS transitions (not just keyframes). The exit class should
change a property with a non-zero transition duration (for example, opacity or transform). The
element is removed after the transition ends (with a timeout fallback).

For predictable timing, use explicit transition properties (e.g., `opacity, transform`) instead of
`transition-property: all`.

#### Example: Background color flash

```css
/* Enter - green background fade */
@keyframes bg-flash-enter {
  from { background-color: #D1E7DD; }
  to   { background-color: inherit; }
}

.bg-flash-enter {
  animation: bg-flash-enter 1.2s ease-out;
}

/* Change - yellow background fade */
@keyframes bg-flash-change {
  from { background-color: #FFF3CD; }
  to   { background-color: inherit; }
}

.bg-flash-change {
  animation: bg-flash-change 1.2s ease-out;
}

/* Exit - red background fade + opacity */
@keyframes bg-flash-exit {
  from { background-color: #F8D7DA; opacity: 1; }
  to   { background-color: inherit; opacity: 0; }
}

.bg-flash-exit {
  animation: bg-flash-exit 0.6s ease-out forwards;
}
```

#### Example: Slide in/out

```css
@keyframes slideInDown {
  from {
    transform: translate3d(0, -100%, 0);
    visibility: visible;
  }
  to {
    transform: translate3d(0, 0, 0);
  }
}

.slideInDown {
  animation: slideInDown 0.5s ease-out;
}

@keyframes slideOutUp {
  from {
    transform: translate3d(0, 0, 0);
  }
  to {
    visibility: hidden;
    transform: translate3d(0, -100%, 0);
  }
}

.slideOutUp {
  animation: slideOutUp 0.5s ease-out forwards;
}
```

##### Masking slide animations

Transform-based slide animations can "ghost" over adjacent rows because they paint outside their own box.
To keep the motion contained, apply `overflow: hidden` on the animated element and animate a child:

```erb
<li data-turbo-refresh-animate
    data-turbo-refresh-enter="slide-mask-enter"
    data-turbo-refresh-exit="slide-mask-exit">
  <div class="slide-mask-content">
    <%= item.title %>
  </div>
</li>
```

```css
.slide-mask-enter,
.slide-mask-exit {
  overflow: hidden;
}

.slide-mask-enter > .slide-mask-content {
  animation: slideInDown 0.5s ease-out;
}

.slide-mask-exit > .slide-mask-content {
  animation: slideOutUp 0.5s ease-out forwards;
}
```

Use custom classes per element:

```erb
<div id="<%= dom_id(item) %>"
     data-turbo-refresh-animate
     data-turbo-refresh-enter="slideInDown"
     data-turbo-refresh-exit="slideOutUp">
  <%= item.title %>
</div>
```

### Example animations

Copy/paste this example into your app's stylesheet:

```css
/* Enter - fade in */
.turbo-refresh-enter {
  animation: turbo-refresh-enter 300ms ease-out;
}

@keyframes turbo-refresh-enter {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Exit - fade out */
.turbo-refresh-exit {
  animation: turbo-refresh-exit 300ms ease-out forwards;
}

@keyframes turbo-refresh-exit {
  from { opacity: 1; }
  to { opacity: 0; }
}

/* Change - yellow background flash */
.turbo-refresh-change {
  animation: turbo-refresh-change 800ms ease-out;
}

@keyframes turbo-refresh-change {
  from { background-color: #FFF3CD; }
  to { background-color: inherit; }
}

@media (prefers-reduced-motion: reduce) {
  .turbo-refresh-enter,
  .turbo-refresh-change,
  .turbo-refresh-exit {
    animation-duration: 1ms;
    animation-iteration-count: 1;
  }
}
```

## Refresh Deduping Notes

You might be worried about the performance of using Turbo Refreshes so heavily, especially when paired with `broadcasts` from models. It's not as bad as you might think, because Turbo does two kinds of refresh deduping:

- Backend (Turbo Rails): `broadcasts_refreshes_to` uses `broadcast_refresh_later_to`, which is debounced per stream name + `request_id` on the current thread. Multiple refreshes in quick succession coalesce into the last one. This does not apply to `broadcast_refresh_to`, and it is not a process-wide/global dedupe.
- Frontend (Turbo Source): refresh stream actions are debounced in the session (default 150ms via `pageRefreshDebouncePeriod`), and refreshes with a `request-id` that matches a recent client request are ignored. The `request-id` is set automatically when you use `Turbo.fetch` (it adds `X-Turbo-Request-Id`).

## Disabling the Turbo Progress Bar

This library disables the Turbo progress bar during morph operations (but keeps it for regular navigation):

```javascript
document.addEventListener("turbo:morph", () => {
  Turbo.navigator.delegate.adapter.progressBar.hide()
})
```

See [hotwired/turbo#1221](https://github.com/hotwired/turbo/issues/1221) for discussion on making this configurable in Turbo itself.

## Experimental: Position Animations (FLIP)

When elements reorder during a morph (e.g., a completed todo moves to the bottom of the list), they normally jump to their new position instantly. Add `data-turbo-refresh-move` to opt in to smooth FLIP ([First, Last, Invert, Play](https://aerotwist.com/blog/flip-your-animations/)) position animations:

```erb
<div id="<%= dom_id(item) %>"
     data-turbo-refresh-animate
     data-turbo-refresh-move>
  <%= item.content %>
</div>
```

`data-turbo-refresh-move` is independent of `data-turbo-refresh-animate` — you can use either or both. `animate` controls enter/change/exit CSS class animations; `move` controls FLIP position sliding.

Elements slide from their old position to their new one at constant velocity (800px/s by default).

### Customizing move animations

Control speed, duration, and easing via CSS custom properties:

```css
[data-turbo-refresh-move] {
  --turbo-refresh-move-speed: 400;       /* px/s (default 800) */
  --turbo-refresh-move-easing: ease-in-out; /* default: ease-out */
}
```

For a fixed duration (like View Transitions), set `--turbo-refresh-move-duration`. This overrides the speed calculation:

```css
[data-turbo-refresh-move] {
  --turbo-refresh-move-duration: 500ms;
}
```

### Known limitation: z-index stacking

During the animation, moving elements may pass behind stationary siblings. This happens because CSS transforms don't reliably override DOM paint order. We attempted `transform-style: preserve-3d` with `translateZ` but results were intermittent across browsers.

**Mitigation**: Give animated elements an opaque background so the overlap is less noticeable:

```css
[data-turbo-refresh-move] {
  background-color: #fff; /* or your page's background color */
}
```

### Why not View Transitions?

The [View Transitions API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API) handles position animations natively (and without the z-index issue, since snapshots render in a dedicated overlay). However, it cannot do clean exit animations — removed elements "ghost" over already-shifted content. See [#3](https://github.com/firstdraft/turbo-refresh-animations/issues/3) for a detailed comparison.

## TODOs

- Expose a hook to set animation parameters before animations run (e.g., to measure `scrollHeight`
  for jQuery UI-style "push siblings" slide animations).

## License

MIT
