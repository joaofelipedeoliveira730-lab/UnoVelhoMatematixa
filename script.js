
/* ===== PLATAFORMA ===== */
(function(){
  const gate = document.getElementById("platformGate");
  if(!gate) return;

  function setPlatform(mode){
    const platform = mode === "mobile" ? "mobile" : "desktop";
    document.body.classList.remove("platform-mobile","platform-desktop");
    document.body.classList.add("platform-" + platform);
    localStorage.setItem("uv_platform", platform);
    gate.remove();
    window.VELHO_PLATFORM = platform;
    document.dispatchEvent(new CustomEvent("velho:platform", {detail:{platform}}));
  }

  gate.querySelectorAll("[data-platform]").forEach(btn=>{
    btn.addEventListener("click", ()=>setPlatform(btn.dataset.platform));
  });

  const auto = gate.querySelector("#autoPlatform");
  auto.addEventListener("click", ()=>{
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
      || window.matchMedia("(max-width: 760px)").matches;
    setPlatform(isMobile ? "mobile" : "desktop");
  });
})();

