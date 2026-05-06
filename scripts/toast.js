// scripts/toast.js
// Pricing freshness toast — shows on every page load, auto-hides after 5s

(function () {
  const toast = document.getElementById("pricing-toast");
  if (!toast) return;

  const closeBtn = toast.querySelector(".pricing-toast__close");
  let hideTimer;

  function showToast() {
    requestAnimationFrame(() => {
      toast.classList.add("is-visible");
    });
    hideTimer = setTimeout(hideToast, 5000);
  }

  function hideToast() {
    clearTimeout(hideTimer);
    toast.classList.remove("is-visible");
  }

  closeBtn.addEventListener("click", hideToast);

  // Show 600ms after page load (let layout settle)
  setTimeout(showToast, 600);
})();
