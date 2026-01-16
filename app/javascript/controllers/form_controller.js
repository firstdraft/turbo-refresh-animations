import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["input"]

  clear(event) {
    if (event.detail.success) {
      this.element.reset()
      this.inputTarget.classList.remove("is-invalid")
    } else {
      this.inputTarget.classList.add("is-invalid")
    }
  }
}
