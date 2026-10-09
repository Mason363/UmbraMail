/* =================================================================== the development harness (never published)
   Lets the harness look at and call anything inside, by name: __umbra.x("cp()"), __umbra.x("paperOn = true") */
if (window.__umbra) window.__umbra.x = (code) => eval(window.__umbraPolicy ? window.__umbraPolicy.createScript(code) : code);
