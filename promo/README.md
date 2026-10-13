# NIGHT ON 30초 홍보영상 제작 폴더

사이트와 분리된 영상 제작 파일입니다. `../images`의 이미지를 읽기만 하며 사이트 파일은 수정하지 않습니다.

## 구성

```text
promo/
  render.py                   프레임 합성 + MP4 인코딩 스크립트
  preview_day_to_night.mp4    낮→밤 핵심 장면 미리보기(8초)   ← 2단계 확인용
  voice_samples/              나레이션 목소리 샘플
  NIGHT_ON_promo_30s.mp4      최종 영상 (3단계에서 생성)
```

## 필요한 환경

- Python 3 + `numpy`, `Pillow`, `imageio-ffmpeg` (ffmpeg 바이너리 포함)
  ```powershell
  python -m pip install numpy pillow imageio-ffmpeg
  ```
- 한글 글꼴: Windows의 `NotoSansKR-VF.ttf` (없으면 맑은 고딕으로 대체)

## 재출력

```powershell
cd <프로젝트 폴더>\promo
python render.py --preview     # 낮→밤 미리보기 8초 → preview_day_to_night.mp4
python render.py               # 전체 30초 → NIGHT_ON_promo_30s.mp4 (3단계 이후)
```

## 낮→밤 전환 방식

`hero_day.png`와 `hero_night.png`는 같은 구도(이동 오차 0px)라 두 장을 겹치고, 전등 링 중심(원본 좌표 902, 226 부근)에서 바깥으로 자라는 타원형 소프트 마스크로 밤 이미지를 섞습니다. 밤 이미지 자체가 창가를 밝게 유지하므로 전환이 끝나도 창가는 낮 그대로입니다. 전등은 원본 이미지의 얇은 라벤더 링만 보이고 빛을 쏘거나 번쩍이지 않습니다.

조절 지점(`render.py`):
- `DayNightBlender(center, axes, feather)` : 번짐 중심, 타원 비율, 가장자리 부드러움
- `scene_day_to_night()` 의 `ramp(t, 1.5, 5.5)` : 어두워지는 시작·끝 시각
- `zoom 1.00 → 1.06` : 확대 폭
