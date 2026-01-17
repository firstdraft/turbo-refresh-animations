/**
 * Turbo Refresh Animations
 *
 * CSS class-based animations for Turbo page refresh morphs.
 * Automatically animates elements on create, update, and delete.
 * Protects forms from being cleared during broadcast refreshes.
 *
 * Default behavior:
 *   - Elements with `id` attributes are automatically tracked
 *   - Default animation classes: turbo-refresh-enter, turbo-refresh-update, turbo-refresh-exit
 *
 * Optional data attributes for customization:
 *   data-turbo-refresh-id="unique-id"      - Override element identifier (default: uses id attribute)
 *   data-turbo-refresh-permanent           - Protect element during broadcast morphs
 *   data-turbo-refresh-enter-class="cls"   - Override enter animation class
 *   data-turbo-refresh-update-class="cls"  - Override update animation class
 *   data-turbo-refresh-exit-class="cls"    - Override exit animation class
 */

// Default animation class names
const DEFAULT_ENTER_CLASS = "turbo-refresh-enter"
const DEFAULT_UPDATE_CLASS = "turbo-refresh-update"
const DEFAULT_EXIT_CLASS = "turbo-refresh-exit"

// ========== PAGE TRACKING ==========
// Track whether we've rendered this page before to avoid animating
// existing elements as "creates" on initial page navigation.

let hasRenderedCurrentPage = false
let lastRenderedUrl = null

document.addEventListener("turbo:visit", (event) => {
  const visitUrl = event.detail.url
  // Only reset when navigating to a DIFFERENT page
  if (lastRenderedUrl && visitUrl !== lastRenderedUrl) {
    hasRenderedCurrentPage = false
  }
})

// ========== FORM PROTECTION ==========
// Protect elements with data-turbo-refresh-permanent during morphs,
// EXCEPT the specific form the user is currently submitting.

let submittingFormId = null

document.addEventListener("turbo:submit-start", (event) => {
  const form = event.target
  const wrapper = form.closest("[data-turbo-refresh-permanent]")
  submittingFormId = wrapper?.id || null
})

document.addEventListener("turbo:submit-end", (event) => {
  if (!event.detail.fetchResponse?.response?.redirected) {
    submittingFormId = null
  }
})

// ========== HELPER FUNCTIONS ==========

function getElementId(el) {
  return el.dataset?.turboRefreshId || el.id
}

function getEnterClass(el) {
  return el.dataset?.turboRefreshEnterClass || DEFAULT_ENTER_CLASS
}

function getUpdateClass(el) {
  return el.dataset?.turboRefreshUpdateClass || DEFAULT_UPDATE_CLASS
}

function getExitClass(el) {
  return el.dataset?.turboRefreshExitClass || DEFAULT_EXIT_CLASS
}

function applyAnimation(el, animClass) {
  if (!animClass) return
  el.classList.add(animClass)
  el.addEventListener("animationend", () => el.classList.remove(animClass), {
    once: true,
  })
}

// ========== DELETE ANIMATIONS (SUBMITTER) ==========
// For the user clicking delete: intercept click, animate, then proceed.
// Uses capture phase to run before Turbo's handler.

document.addEventListener(
  "click",
  (event) => {
    const link = event.target.closest('a[data-turbo-method="delete"]')
    if (!link) return

    const item = link.closest("[id]")
    if (!item) return

    // Skip if animation already done (allow the real click through)
    if (item.dataset.turboRefreshExitDone) return

    event.preventDefault()
    event.stopPropagation()

    const animClass = getExitClass(item)
    item.classList.add(animClass)
    item.addEventListener(
      "animationend",
      () => {
        item.dataset.turboRefreshExitDone = "true"
        link.click()
      },
      { once: true }
    )
  },
  { capture: true }
)

// ========== MORPH HANDLING ==========
// Use turbo:before-morph-element to detect updates and deletes,
// piggybacking on Idiomorph's element matching.

let pendingUpdates = new Map()
let pendingDeletions = new Map()

document.addEventListener("turbo:before-morph-element", (event) => {
  const el = event.target
  const { newElement } = event.detail
  const id = getElementId(el)

  // Protect permanent elements, unless it's the form we're submitting
  if (el.hasAttribute("data-turbo-refresh-permanent")) {
    if (el.id !== submittingFormId) {
      event.preventDefault()

      // If this protected element has a pending update animation, apply it now
      if (pendingUpdates.has(id)) {
        applyAnimation(el, pendingUpdates.get(id))
        pendingUpdates.delete(id)
      }
      return
    }
  }

  // DELETE: newElement is undefined (Idiomorph is removing this element)
  if (newElement === undefined && id) {
    event.preventDefault()
    const animClass = getExitClass(el)
    el.classList.add(animClass)
    el.addEventListener(
      "animationend",
      () => el.remove(),
      { once: true }
    )
    return
  }

  // UPDATE: both elements exist, queue animation for after render
  if (id && newElement && pendingUpdates.has(id)) {
    // Animation will be applied in turbo:render
  }
})

// ========== CREATE & UPDATE DETECTION ==========
// Detect creates via DOM comparison in turbo:before-render.
// Detect updates by comparing element content.

let pendingAnimations = []

document.addEventListener("turbo:before-render", (event) => {
  if (!event.detail.newBody) return

  pendingAnimations = []
  pendingUpdates = new Map()
  pendingDeletions = new Map()

  // Skip all animation detection on initial page navigation
  if (!hasRenderedCurrentPage) return

  // Build maps of elements by their id
  const oldMap = new Map()
  document.querySelectorAll("[id]").forEach((el) => {
    const id = getElementId(el)
    if (id) {
      oldMap.set(id, {
        el: el,
        innerHTML: el.innerHTML,
        isPermanent: el.hasAttribute("data-turbo-refresh-permanent"),
      })
    }
  })

  const newMap = new Map()
  event.detail.newBody.querySelectorAll("[id]").forEach((el) => {
    const id = getElementId(el)
    if (id) {
      newMap.set(id, {
        el: el,
        innerHTML: el.innerHTML,
      })
    }
  })

  // Creates: in new but not old
  newMap.forEach((newData, id) => {
    if (!oldMap.has(id)) {
      pendingAnimations.push({ id, animClass: getEnterClass(newData.el) })
    }
  })

  // Updates: in both but content differs
  oldMap.forEach((oldData, id) => {
    if (newMap.has(id)) {
      const newData = newMap.get(id)
      if (oldData.innerHTML !== newData.innerHTML) {
        const animClass = getUpdateClass(newData.el)
        if (oldData.isPermanent && oldData.el.id !== submittingFormId) {
          // Protected element won't morph - animate immediately
          applyAnimation(oldData.el, animClass)
        } else {
          // Queue for turbo:before-morph-element and turbo:render
          pendingUpdates.set(id, animClass)
          pendingAnimations.push({ id, animClass })
        }
      }
    }
  })
})

// ========== APPLY ANIMATIONS AFTER RENDER ==========

document.addEventListener("turbo:render", () => {
  // Mark page as rendered for same-page refresh detection
  hasRenderedCurrentPage = true
  lastRenderedUrl = window.location.href

  // Clear form submission tracking
  submittingFormId = null

  // Apply pending animations to newly rendered elements
  pendingAnimations.forEach(({ id, animClass }) => {
    const el = document.querySelector(`[id="${id}"], [data-turbo-refresh-id="${id}"]`)
    if (el) {
      applyAnimation(el, animClass)
    }
  })
  pendingAnimations = []
  pendingUpdates = new Map()
})
