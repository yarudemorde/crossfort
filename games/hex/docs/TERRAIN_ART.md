# 地形画像

添付された7枚を加工せずに使用します。SVGの六角形クリップ内で表示し、領土・移動候補・経路・駒を上に重ねます。視野外の探索済み地形は暗くし、未探索は全て同じ霧画像です。

| 地形 | 元ファイル | ゲーム内画像 |
| --- | --- | --- |
| plain | `477DBD1F-25B0-4D13-94F4-454861E88AB7.jpeg` | `src/assets/terrain/plain.jpeg` |
| forest | `89D9142F-537D-442D-8937-F020B70F3657.jpeg` | `src/assets/terrain/forest.jpeg` |
| mountain | `A142472D-F143-4B89-ABB9-B87587679773.jpeg` | `src/assets/terrain/mountain.jpeg` |
| swamp | `1221A6F4-D49A-466C-B730-7A99DF3A73A1(1).jpeg` | `src/assets/terrain/swamp.jpeg` |
| river | `53C12CC1-F92B-4135-9E97-DE5ED92DD7F0(1).jpeg` | `src/assets/terrain/river.jpeg` |
| desert | `5ACBFA66-1B4D-4890-9B17-33BF4F79EACD.jpeg` | `src/assets/terrain/desert.jpeg` |
| fog | `C8371969-AA4A-495F-8B6A-589139243E08.jpeg` | `src/assets/terrain/fog.jpeg` |

画像の選択は `src/data/terrain-art.ts`、描画は `src/components/TerrainTile.tsx`、領土や候補の重ね方は `src/app/terrain.css` で管理します。ゲームルール・地形配置・視野判定は変更していません。
