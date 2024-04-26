// chrome extension https://chromewebstore.google.com/detail/resource-override/pkoacgokdfckfpndoffpifphamojphii
// https://hamsterkombat.io/js/telegram-web-app.js -> https://serezhka.github.io/hamsterkombat/js/telegram-web-app.js

(function () {
    const evt1 = new PointerEvent('pointerdown', {clientX: 150, clientY: 300});
    const evt2 = new PointerEvent('pointerup', {clientX: 150, clientY: 300});
    setInterval((function fn() {
        const energy = parseInt(document.getElementsByClassName("user-tap-energy")[0].getElementsByTagName("p")[0].textContent.split(" / ")[0]);
        if (energy > 25) {
            document.getElementsByClassName('user-tap-button')[0].dispatchEvent(evt1);
            document.getElementsByClassName('user-tap-button')[0].dispatchEvent(evt2);
        }
        return fn;
    })(), 50);
})();