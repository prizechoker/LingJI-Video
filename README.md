# LingJI-Video

中文机器人视频自媒体账号的内容策划与制作仓库。

## 阶段文档

| 阶段 | 内容 | 文档 | 状态 |
|---|---|---|---|
| 一 | 战略讨论：账号诊断、风格对比、故事路线、核心问题、平台与视觉、标题封面 | [docs/stage1-strategy.md](docs/stage1-strategy.md) | 已确认（调整见[决策记录](docs/decisions.md)） |
| 二～四 | 第 1 集《棋盘之外》：脚本、分镜、配音、配乐、成片 | [video/](video/)、[发布资料](docs/ep01-publish.md) | 制作中 |

## 第 1 集制作流水线（`video/`）

全部画面由代码逐帧渲染，配音、配乐、音效均为开源工具或可商用素材生成，可完整复现。

| 步骤 | 工具 | 说明 |
|---|---|---|
| 旁白脚本 | `data/script.json` | 每句的配音文本、字幕（含高亮标记）、句后停顿 |
| 配音 | `tools/tts_produce.py` | Qwen3-TTS（Apache-2.0）：先用 VoiceDesign 设计专属音色，再用 Base 模型克隆，每句生成 3 个版本 |
| 选版 | `tools/tts_select.py` | 语音识别核对错漏字（拼音比对）、UTMOSv2 自然度评分、语速与停顿检查，自动挑选每句最佳版本并拼接 |
| 时间轴 | `tools/build_timeline.py` | 按旁白逐字时间戳，把镜头切换、动画节点、字幕全部对齐到具体的词 |
| 画面 | `engine/` + `tools/render.mjs` | Canvas 2D + three.js 确定性逐帧渲染，多进程并行，输出 H.264 |
| 配乐与音效 | `tools/score.py`、`tools/audiolib.py` | 原创编曲：真实钢琴（FreePats CC0）与大提琴（爱荷华大学 MIS）采样 + 合成器，按时间轴同步 |
| 混音 | `tools/mix.py` | 人声链、音乐自动闪避、限幅，响度 -14 LUFS |
| 成片 | `tools/finalize.sh` | 时间轴 → 配乐 → 混音 → 渲染 → 封装 → 字幕文件 → 封面，一条命令 |
| 质检 | `tools/review_sheet.py` | 每句字幕、每个切点各取一帧拼成联系表，逐句核对音画是否一致 |

### 运行

```bash
cd video
npm install
python tools/tts_produce.py --ref audio/voice_ref.wav --ref-text "…" --takes 3   # qwen-tts 环境
python tools/tts_select.py                                                        # funasr + transformers 环境
python tools/build_timeline.py
python tools/score.py && python tools/mix.py
node tools/render.mjs --scale 1 --workers 3 --out out/film_1080.mp4
ffmpeg -i out/film_1080.mp4 -i audio/mix.wav -c:v copy -c:a aac -b:a 320k -shortest out/ep01.mp4
# 或者一步到位：tools/finalize.sh 1 3
python tools/review_sheet.py out/ep01_1080.mp4 out/review                         # 质检联系表
```

### 素材与授权

- 手部三维模型：WebXR Input Profiles（MIT），见 `assets/models/LICENSE-webxr-input-profiles.md`
- 棋谱：英国围棋协会公开的 AlphaGo 对李世石第 2 局记录（事实数据）
- 字体：Noto Serif SC / Noto Sans SC / JetBrains Mono（SIL OFL）
- 钢琴采样：FreePats Upright Piano KW（CC0）；大提琴采样：University of Iowa MIS（无使用限制）
- 配音模型：Qwen3-TTS（Apache-2.0）；音色为模型设计生成，不对应任何真实人物
