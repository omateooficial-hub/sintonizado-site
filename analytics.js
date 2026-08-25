(() => {
  "use strict";

  const cfg = window.ANALYTICS_CONFIG || {};
  const id = String(cfg.measurementId || "").trim();

  if (!/^G-[A-Z0-9]+$/i.test(id) || id === "G-XXXXXXXXXX") {
    console.info("Google Analytics: adicione seu Measurement ID em analytics-config.js");
    return;
  }

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function(){ dataLayer.push(arguments); };

  gtag("js", new Date());
  gtag("config", id, {
    anonymize_ip: true,
    send_page_view: true
  });

  // Campaign phase events
  document.addEventListener("click", (e) => {
    const btn = e.target.closest?.(
      "#phase1NextBtn,#phase2NextBtn,#phase3NextBtn,#phase4NextBtn,#phase5NextBtn,#phase5EndNextBtn"
    );
    if (!btn || typeof window.gtag !== "function") return;

    const map = {
      phase1NextBtn: "phase_1_complete",
      phase2NextBtn: "phase_2_complete",
      phase3NextBtn: "phase_3_complete",
      phase4NextBtn: "phase_4_complete",
      phase5NextBtn: "phase_5_complete",
      phase5EndNextBtn: "phase_5_complete"
    };

    const eventName = map[btn.id];
    if (eventName) {
      gtag("event", eventName, {
        event_category: "album_experience",
        event_label: "FREQUENCIA"
      });
    }
  });

  // Presave click
  document.addEventListener("click", (e) => {
    const link = e.target.closest?.('a[href*="sndo.ffm.to"],#phase5PresaveBtn');
    if (!link || typeof window.gtag !== "function") return;

    gtag("event", "presave_click", {
      event_category: "conversion",
      event_label: "FREQUENCIA"
    });
  });
})();
