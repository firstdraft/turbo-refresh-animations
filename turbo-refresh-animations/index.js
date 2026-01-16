/**
 * Turbo Refresh Animations
 *
 * CSS class-based animations for Turbo page refresh morphs.
 * Automatically animates elements on create, update, and delete.
 * Protects forms from being cleared during broadcast refreshes.
 *
 * Data attributes:
 *   data-turbo-refresh-id="unique-id"      - Identifies element for tracking
 *   data-turbo-refresh-version="value"     - Version to compare (e.g., updated_at timestamp)
 *   data-turbo-refresh-permanent           - Protect element during broadcast morphs
 *   data-turbo-refresh-enter-class="cls"   - CSS class for new elements
 *   data-turbo-refresh-update-class="cls"  - CSS class for modified elements
 *   data-turbo-refresh-exit-class="cls"    - CSS class for removed elements
 */

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

// ========== DELETE ANIMATIONS ==========

let pendingDeletions = new Map()

// For submitter: intercept click, animate, then proceed
// Use capture phase to run before Turbo's handler
document.addEventListener(
  "click",
  (event) => {
    const link = event.target.closest('a[data-turbo-method="delete"]')
    if (!link) return

    const item = link.closest("[data-turbo-refresh-exit-class]")
    if (!item) return

    // Skip if animation already done (allow the real click through)
    if (item.dataset.turboRefreshExitDone) return

    event.preventDefault()
    event.stopPropagation()

    const animClass = item.dataset.turboRefreshExitClass
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

// ========== MORPH PROTECTION ==========

document.addEventListener("turbo:before-morph-element", (event) => {
  const el = event.target

  // Protect permanent elements, unless it's the form we're submitting
  if (el.hasAttribute("data-turbo-refresh-permanent")) {
    if (el.id !== submittingFormId) {
      event.preventDefault()
      return
    }
  }

  // For other clients: animate deletion before removal
  const id = el.dataset?.turboRefreshId
  const exitClass = el.dataset?.turboRefreshExitClass
  if (id && exitClass && pendingDeletions.has(id)) {
    event.preventDefault()
    el.classList.add(exitClass)
    el.addEventListener(
      "animationend",
      () => {
        el.remove()
        pendingDeletions.delete(id)
      },
      { once: true }
    )
  }
})

document.addEventListener("turbo:render", () => {
  submittingFormId = null
})

// ========== ANIMATION DETECTION ==========

let pendingAnimations = []

function applyAnimation(el, animClass) {
  el.classList.add(animClass)
  el.addEventListener("animationend", () => el.classList.remove(animClass), {
    once: true,
  })
}

document.addEventListener("turbo:before-render", (event) => {
  if (!event.detail.newBody) return

  // Build maps of ALL elements by their turbo-refresh-id
  const oldMap = new Map()
  document.querySelectorAll("[data-turbo-refresh-id]").forEach((el) => {
    oldMap.set(el.dataset.turboRefreshId, {
      version: el.dataset.turboRefreshVersion,
      el: el,
      isPermanent: el.hasAttribute("data-turbo-refresh-permanent"),
    })
  })

  const newMap = new Map()
  event.detail.newBody.querySelectorAll("[data-turbo-refresh-id]").forEach((el) => {
    newMap.set(el.dataset.turboRefreshId, {
      version: el.dataset.turboRefreshVersion,
      enterClass: el.dataset.turboRefreshEnterClass,
      updateClass: el.dataset.turboRefreshUpdateClass,
    })
  })

  pendingAnimations = []
  pendingDeletions = new Map()

  // Deletions: in old but not new
  oldMap.forEach((oldData, id) => {
    if (!newMap.has(id) && oldData.el.dataset.turboRefreshExitClass) {
      pendingDeletions.set(id, true)
    }
  })

  // Creates: in new but not old
  newMap.forEach((newData, id) => {
    if (!oldMap.has(id) && newData.enterClass) {
      pendingAnimations.push({ id, animClass: newData.enterClass })
    }
  })

  // Modifications: in both but version differs
  oldMap.forEach((oldData, id) => {
    if (newMap.has(id)) {
      const newData = newMap.get(id)
      // Only compare if both have versions; skip if either is missing
      if (oldData.version && newData.version && oldData.version !== newData.version && newData.updateClass) {
        // Protected elements that won't morph: animate immediately
        if (oldData.isPermanent && oldData.el.id !== submittingFormId) {
          applyAnimation(oldData.el, newData.updateClass)
        } else {
          // Element will be morphed: queue for after render
          pendingAnimations.push({ id, animClass: newData.updateClass })
        }
      }
    }
  })
})

document.addEventListener("turbo:render", () => {
  // Apply pending animations after DOM has updated
  pendingAnimations.forEach(({ id, animClass }) => {
    const el = document.querySelector(`[data-turbo-refresh-id="${id}"]`)
    if (el) {
      applyAnimation(el, animClass)
    }
  })
  pendingAnimations = []
})
