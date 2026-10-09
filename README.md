# Cello Tiles

Juego tipo Piano Tiles con temática de cello, para jugar en el navegador del celular o el iPad.
Cuatro carriles = las cuatro cuerdas del cello (C, G, D, A), con estética cozy pixel art.

## Cómo jugar

Toca las notas a medida que bajan por las cuerdas. Si tocas una cuerda vacía o dejas escapar
una nota, se termina la partida. Cada nota suena con un pequeño sintetizador de cello.

En computadora también se puede jugar con las teclas `D F J K`.

## Probarlo localmente

No hace falta instalar nada: abrí `index.html` en el navegador, o levantá un servidor:

```sh
python3 -m http.server 8000
```

## Estructura

- `index.html`, `style.css`: pantallas y estilo.
- `js/game.js`: dibujo en canvas pixel art, lógica del juego y controles táctiles.
- `js/audio.js`: sonido de cello sintetizado con Web Audio.
- `js/songs.js`: cuerdas, notas y formato de canciones. Hoy las notas son aleatorias
  (en Do mayor); para agregar una canción real, sumala al arreglo `SONGS` con el formato
  descrito ahí.
