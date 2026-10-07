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
