// Configure your import map in config/importmap.rb. Read more: https://github.com/rails/importmap-rails
import "@hotwired/turbo-rails"
import "controllers"
import "bootstrap"

// Protect elements with data-turbo-broadcast-refresh-permanent during
// broadcast-triggered refreshes only. Navigation-triggered morphs (like
// following a redirect) are allowed through so forms clear after submission.
let inBroadcastRefresh = false

document.addEventListener("turbo:before-stream-render", (event) => {
  if (event.target.getAttribute("action") === "refresh") {
    inBroadcastRefresh = true
  }
})

document.addEventListener("turbo:before-morph-element", (event) => {
  if (inBroadcastRefresh && event.target.hasAttribute("data-turbo-broadcast-refresh-permanent")) {
    event.preventDefault()
  }
})

document.addEventListener("turbo:render", () => {
  inBroadcastRefresh = false
})
