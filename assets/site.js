/* 이건상 · 읽는 구역이 화면에 들어올 때 나타나게 한다. 이 파일을 못 받으면 글은 처음부터 그대로 보인다 */
(function () {
  "use strict";
  var d = document, h = d.documentElement;
  if (!("IntersectionObserver" in window)) return;
  var els = Array.prototype.slice.call(d.querySelectorAll(".rv")), vh = window.innerHeight;
  // 이미 화면 안에 있는 것은 감추지 않는다
  els.forEach(function (el) { var r = el.getBoundingClientRect(); if (r.top < vh && r.bottom > 0) el.classList.add("in"); });
  h.classList.add("rvjs");
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
  els.forEach(function (el) { if (!el.classList.contains("in")) io.observe(el); });
})();
/* 이메일: 메일 앱을 띄우지 않고 주소를 보여 준다. 누르면 주소를 복사하고 잠깐 알린다 */
(function () {
  "use strict";
  var d = document, toast = d.querySelector(".toast"), t = 0;
  function say(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("on");
    clearTimeout(t);
    // 숨길 때 비워야 같은 글을 다시 넣었을 때 화면 읽기 프로그램이 또 읽는다
    t = setTimeout(function () { toast.classList.remove("on"); toast.textContent = ""; }, 2200);
  }
  function fallback(text, b) {
    var a = d.createElement("textarea"), ok = false;
    a.value = text; a.setAttribute("readonly", ""); a.style.position = "fixed"; a.style.opacity = "0";
    d.body.appendChild(a); a.select();
    try { ok = d.execCommand("copy"); } catch (e) {}
    d.body.removeChild(a);
    b.focus({ preventScroll: true });
    return ok;
  }
  d.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("button.copy");
    if (!b) return;
    var text = b.getAttribute("data-copy"), dict = window.__I18N_DICT || {}, L = d.documentElement.lang === "en" ? "en" : "ko";
    var msg = ((dict[L] && dict[L]["ui.copied"]) || "Copied · {e}").replace("{e}", text);
    function done(ok) { say(ok ? msg : text); }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallback(text, b)); });
    else done(fallback(text, b));
  });
})();
