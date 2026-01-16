// Configure your import map in config/importmap.rb. Read more: https://github.com/rails/importmap-rails
import "@hotwired/turbo-rails"
import "controllers"
import "bootstrap"

// Protect elements with data-turbo-stream-refresh-permanent during
// stream-delivered refreshes only. Navigation-triggered morphs (like
// following a redirect) are allowed through so forms clear after submission.
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
