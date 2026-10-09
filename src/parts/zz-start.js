/* =================================================================== start
   (last: every part above has set itself up by now) */
if (document.body) boot();
else { document.addEventListener("DOMContentLoaded", boot, { once: true }); schedule(); }
