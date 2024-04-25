// chrome extension https://chromewebstore.google.com/detail/resource-override/pkoacgokdfckfpndoffpifphamojphii
// https://hamsterkombat.io/js/telegram-web-app.js -> https://serezhka.github.io/hamsterkombat/js/telegram-web-app.js

(function () {
    setInterval((function fn() {
        const evt1 = new PointerEvent('pointerdown', {
            clientX: 100,
            clientY: 400,
        });
        const evt2 = new PointerEvent('pointerup', {
            clientX: 100,
            clientY: 400,
        });
        const energy = parseInt(document.getElementsByClassName("user-tap-energy")[0].getElementsByTagName("p")[0].textContent.split(" / ")[0]);
        console.log('energy: ', energy)
        if (energy > 200) {
            document.getElementsByClassName('user-tap-button')[0].dispatchEvent(evt1);
            document.getElementsByClassName('user-tap-button')[0].dispatchEvent(evt2);
        }
        return fn;
    })(), 100);
})();