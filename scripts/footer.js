// Hide footer link pointing to the current page.
// Runs after DOM is ready so it sees all <a> elements.
document.addEventListener("DOMContentLoaded", () => {
  const currentPath =
    window.location.pathname.replace(/\.html$/, "").replace(/\/$/, "") || "/";

  document.querySelectorAll(".footer-nav a").forEach((link) => {
    const linkPath =
      link
        .getAttribute("href")
        .replace(/\.html$/, "")
        .replace(/\/$/, "") || "/";
    if (linkPath === currentPath) {
      link.remove();
    }
  });
});
