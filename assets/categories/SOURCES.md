# Category cover sources

These six files are bundled theme-picker covers, not puzzle-photo API results.
They were downloaded from the linked public Unsplash photo pages and
revalidated against the Unsplash License on 2026-07-31. The app credits each
photographer from **About & Support**.

Five derivatives use the same bounded transform:

```text
auto=format&fit=crop&fm=jpg&q=80&w=800&h=534
```

| File | Photographer | Unsplash photo | SHA-256 |
| --- | --- | --- | --- |
| `nature.jpg` | Redd Francisco | [`gdQnsMbhkUs`](https://unsplash.com/photos/gdQnsMbhkUs) | `760d4a408cff02ee29a3c4060ce3306ee6ad3baa0d9c344fe44129503c457f9d` |
| `city.jpg` | Andres Garcia | [`_SWgYuWS9wY`](https://unsplash.com/photos/_SWgYuWS9wY) | `fcbc1301b4eb5501d80a9049bb8be972ac7192f0ccb01187962f33c53d029bb2` |
| `animals-framed.jpg` | Katie Treadway | [`EwE4tBYh3ms`](https://unsplash.com/photos/EwE4tBYh3ms) | `99ef989277db65821e5fdf185883e0842a07f1138d76b51da78fe7bd01097eb0` |
| `travel.jpg` | Danish Prakash | [`IrlGJTJd-qI`](https://unsplash.com/photos/IrlGJTJd-qI) | `858efd30ebff8a49bdaff526bf08e6334d815e160c90644b34f5ae514e52cf4e` |
| `food.jpg` | Brooke Lark | [`4J059aGa5s4`](https://unsplash.com/photos/4J059aGa5s4) | `12aa4b4e84db7cd472d5b1375ae992d797ac25460a088c49fde6f75c066045d3` |
| `ocean.jpg` | Nattu Adnan | [`Bn50DEsK5qc`](https://unsplash.com/photos/Bn50DEsK5qc) | `c1009cbf5ec4eebd81b9b3321cf7d8e00004ec47eff48d8e284f5c101febbc41` |

License page checked on the same date:
[Unsplash License](https://unsplash.com/license).

`animals-framed.jpg` is a deterministic crop of the bundled
`animals.jpg` source (crop `321x214` at offset `260,320`, then resize to
`800x534`). No pixels were synthesized; the separate source file retains the
original downloaded derivative and checksum
`217034fe04a9f2c295b22a77ea443a11ffe9595daeced30268fa33f2e139d211`.

Do not replace a cover without updating its in-app credit, source page,
acquisition date, and checksum here.
