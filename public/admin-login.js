const form = document.getElementById("loginForm");
const passwordInput = document.getElementById("passwordInput");
const statusEl = document.getElementById("status");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusEl.textContent = "";

  const password = passwordInput.value || "";
  const response = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });

  if (!response.ok) {
    statusEl.textContent = "Wrong password.";
    passwordInput.focus();
    passwordInput.select();
    return;
  }

  window.location.assign("/admin");
});
