/* NIGHT ON — 상호작용 스크립트
   역할: 모바일 메뉴, 헤더 스크롤 상태, 앵커 이동, 낮·밤 비교 슬라이더,
         섹션 등장 효과, 이미지 누락 안내
   모든 기능은 JS가 실패해도 본문이 보이도록 "있으면 더 좋은" 방식으로 붙인다. */
(function () {
  'use strict';

  var docEl = document.documentElement;
  var header = document.querySelector('.site-header');
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');
  var desktopQuery = window.matchMedia('(min-width: 768px)');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* =====================================================================
     1. 모바일 메뉴
     ===================================================================== */
  function isMenuOpen() {
    return header.classList.contains('is-open');
  }

  function setMenuOpen(open) {
    header.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    var label = toggle.querySelector('.nav-toggle__label');
    if (label) label.textContent = open ? '메뉴 닫기' : '메뉴';
  }

  if (header && toggle && nav) {
    toggle.addEventListener('click', function () {
      setMenuOpen(!isMenuOpen());
    });

    // 메뉴 안의 링크를 고르면 닫는다.
    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) setMenuOpen(false);
    });

    // Escape로 닫고 토글 버튼으로 포커스를 되돌린다.
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && isMenuOpen()) {
        setMenuOpen(false);
        toggle.focus();
      }
    });

    // 메뉴 바깥을 누르면 닫는다.
    document.addEventListener('click', function (event) {
      if (isMenuOpen() && !header.contains(event.target)) setMenuOpen(false);
    });

    // 데스크톱 폭으로 넓어지면 열린 상태를 정리한다.
    if (typeof desktopQuery.addEventListener === 'function') {
      desktopQuery.addEventListener('change', function (event) {
        if (event.matches) setMenuOpen(false);
      });
    }
  }

  /* =====================================================================
     2. 헤더 스크롤 상태
     ===================================================================== */
  function updateHeader() {
    if (!header) return;
    header.classList.toggle('is-scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', updateHeader, { passive: true });
  updateHeader();

  /* =====================================================================
     3. 앵커 이동
     - 스크롤 자체는 CSS(scroll-behavior, scroll-padding-top)에 맡긴다.
     - 로고(#top)는 페이지 맨 위로 보낸다. 헤더가 고정이라 해시 이동만으로는 안 움직인다.
     - 도착한 섹션으로 포커스를 옮겨 키보드·스크린리더 사용자도 위치를 알 수 있게 한다.
     ===================================================================== */
  document.addEventListener('click', function (event) {
    var link = event.target.closest('a[href^="#"]');
    if (!link) return;

    var id = link.getAttribute('href').slice(1);
    if (!id) return;

    if (id === 'top') {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
      if (history.replaceState) history.replaceState(null, '', location.pathname + location.search);
      return;
    }

    var target = document.getElementById(id);
    if (!target) {
      event.preventDefault();
      return;
    }

    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });

  /* =====================================================================
     4. 낮·밤 비교 슬라이더
     - 투명한 <input type="range">가 마우스·터치·키보드 입력을 모두 받는다.
     - 값(0~100)을 CSS 변수 --split로 넘기면 밤 이미지의 clip-path와
       기준선·손잡이 위치가 함께 바뀐다. 이미지 자체 크기는 바뀌지 않는다.
     ===================================================================== */
  var compareFrames = document.querySelectorAll('[data-compare]');
  Array.prototype.forEach.call(compareFrames, function (frame) {
    var range = frame.querySelector('.compare__range');
    if (!range) return;

    function clamp(value) {
      return Math.min(100, Math.max(0, value));
    }

    function render() {
      var value = clamp(Number(range.value));
      frame.style.setProperty('--split', value + '%');
      range.setAttribute('aria-valuetext', 'NIGHT OFF ' + value + '%, NIGHT ON ' + (100 - value) + '%');
    }

    range.addEventListener('input', render);
    range.addEventListener('change', render);

    // 키보드: 방향키는 브라우저 기본 동작(step=1). Home/End는 양 끝으로.
    range.addEventListener('keydown', function (event) {
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        range.value = event.key === 'Home' ? 0 : 100;
        render();
      }
    });

    // 드래그 중 손잡이 강조
    function startDrag() { frame.classList.add('is-dragging'); }
    function endDrag() { frame.classList.remove('is-dragging'); }
    range.addEventListener('pointerdown', startDrag);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);

    render();
  });

  /* =====================================================================
     5. 섹션 등장 효과
     - IntersectionObserver가 있을 때만 .js-reveal을 켜서 요소를 숨겼다가 보인다.
     - 움직임 줄이기 설정이면 켜지 않는다.
     - 안전장치: 로드 후 일정 시간이 지나면 남은 요소를 모두 보이게 한다.
     ===================================================================== */
  var revealItems = document.querySelectorAll('.reveal');
  if (revealItems.length && 'IntersectionObserver' in window && !reducedMotion.matches) {
    docEl.classList.add('js-reveal');

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });

    Array.prototype.forEach.call(revealItems, function (el) {
      observer.observe(el);
    });

    function revealAll() {
      Array.prototype.forEach.call(revealItems, function (el) {
        el.classList.add('is-visible');
      });
    }
    window.addEventListener('load', function () {
      setTimeout(revealAll, 4000);
    });
    // 인쇄할 때는 전부 보이게
    window.addEventListener('beforeprint', revealAll);
  }

  /* =====================================================================
     6. 이미지 누락 안내
     ===================================================================== */
  var frames = document.querySelectorAll('[data-image]');
  Array.prototype.forEach.call(frames, function (frame) {
    var img = frame.querySelector('img');
    if (!img) return;

    function markMissing() {
      frame.classList.add('is-missing');
    }

    if (img.complete && img.naturalWidth === 0) {
      markMissing();
    } else {
      img.addEventListener('error', markMissing);
    }
  });

  /* =====================================================================
     7. 배경음악
     - 진입 시 볼륨 15%로 한 번만 자동 재생을 시도한다. 차단되면 조용히 멈춘다.
     - 재생은 자동 재생 1회와 버튼 클릭으로만 시작한다. 스크롤·화면 클릭에 연결하지 않는다.
     - 버튼 문구와 aria-pressed는 audio의 실제 playing/pause 이벤트로만 바뀐다.
     - 파일 오류(없음·형식 미지원)는 자동 재생 차단과 구분해 '음원 재생 불가'로 표시하고 더 시도하지 않는다.
     ===================================================================== */
  var bgm = document.querySelector('[data-bgm]');
  if (bgm) {
    var audio = bgm.querySelector('audio');
    var bgmBtn = bgm.querySelector('.bgm__btn');
    var bgmLabel = bgm.querySelector('.bgm__label');
    var bgmStatus = bgm.querySelector('.bgm__status');
    var bgmUnavailable = false;

    function announce(text) {
      if (bgmStatus) bgmStatus.textContent = text;
    }

    function setPlayingUI(playing) {
      if (bgmUnavailable) return;   // '음원 재생 불가' 표시를 pause/emptied 이벤트가 덮어쓰지 않도록
      bgm.classList.toggle('bgm--playing', playing);
      bgmBtn.setAttribute('aria-pressed', playing ? 'true' : 'false');
      bgmBtn.setAttribute('aria-label', playing ? '배경음악 끄기' : '배경음악 켜기');
      bgmLabel.textContent = playing ? '음악 끄기' : '음악 켜기';
    }

    function setUnavailable(reason) {
      if (bgmUnavailable) return;
      bgmUnavailable = true;
      bgm.classList.remove('bgm--playing');
      bgm.classList.add('bgm--unavailable');
      bgmBtn.disabled = true;
      bgmBtn.setAttribute('aria-pressed', 'false');
      bgmBtn.setAttribute('aria-label', '음원 재생 불가');
      bgmBtn.title = '배경음악 파일을 재생할 수 없습니다.';
      bgmLabel.textContent = '음원 재생 불가';
      announce('배경음악을 재생할 수 없습니다. ' + (reason || ''));
    }

    // play() 실패를 종류별로 처리한다. 반환값: true면 파일 문제로 더 시도하지 않는다.
    function handlePlayError(err) {
      var name = err && err.name;
      if (name === 'NotAllowedError') {
        // 브라우저의 자동 재생 차단. 사용자가 버튼을 누르면 재생된다.
        setPlayingUI(false);
        announce('브라우저가 자동 재생을 막았습니다. 음악 켜기 버튼으로 재생할 수 있습니다.');
        return false;
      }
      if (name === 'AbortError') {
        // 로드 중 pause() 등으로 중단된 경우. 오류로 취급하지 않는다.
        setPlayingUI(!audio.paused);
        return false;
      }
      // NotSupportedError 등: 파일이 없거나 형식을 지원하지 않는다.
      setUnavailable('파일을 찾을 수 없거나 형식을 지원하지 않습니다.');
      return true;
    }

    // <source> 로드 실패는 audio.error가 아니라 networkState(NETWORK_NO_SOURCE=3)로만 남는다.
    // 다만 리소스 선택이 아직 시작되기 전에도 잠시 3이 되므로, 즉시 판정하지 않고
    // 시간을 두고 "여전히 3이고 아무 데이터도 없음"일 때만 실패로 본다.
    function looksUnloadable() {
      return audio.networkState === 3 && audio.readyState === 0;
    }

    function scheduleNoSourceCheck() {
      var checks = 0;
      var timer = setInterval(function () {
        checks += 1;
        if (bgmUnavailable || !looksUnloadable()) {
          // 로딩이 시작됐거나(networkState 2) 메타데이터가 왔으면 더 볼 필요가 없다.
          // 이후의 404 등은 source의 error 이벤트가 처리한다.
          clearInterval(timer);
          return;
        }
        if (checks >= 4) {           // 약 2초 동안 계속 NO_SOURCE면 파일 문제로 판단
          clearInterval(timer);
          setUnavailable('파일을 찾을 수 없거나 형식을 지원하지 않습니다.');
        }
      }, 500);
    }

    function tryPlay() {
      if (bgmUnavailable) return;
      var result;
      try {
        result = audio.play();
      } catch (err) {
        handlePlayError(err);
        return;
      }
      if (result && typeof result.then === 'function') {
        result.then(function () {
          // 실제 재생 시작은 'playing' 이벤트가 UI를 갱신한다.
        }).catch(handlePlayError);
      }
    }

    audio.volume = 0.15;
    audio.loop = true;

    // 실제 재생 상태를 기준으로 UI 갱신. 'playing'은 소리가 실제로 나가기 시작할 때만 발생한다.
    audio.addEventListener('playing', function () { setPlayingUI(true); });
    audio.addEventListener('pause', function () { setPlayingUI(false); });
    audio.addEventListener('emptied', function () { setPlayingUI(false); });

    // 파일 로드 실패: 마지막 <source>의 error 또는 audio의 error
    audio.addEventListener('error', function () {
      setUnavailable('파일을 찾을 수 없거나 형식을 지원하지 않습니다.');
    });
    var lastSource = audio.querySelector('source:last-of-type');
    if (lastSource) {
      lastSource.addEventListener('error', function () {
        setUnavailable('파일을 찾을 수 없거나 형식을 지원하지 않습니다.');
      });
    }
    if (audio.error) setUnavailable('파일을 찾을 수 없거나 형식을 지원하지 않습니다.');
    scheduleNoSourceCheck();

    // 버튼: 사용자가 끈 음악은 다시 누르기 전까지 켜지 않는다.
    bgmBtn.addEventListener('click', function () {
      if (bgmUnavailable) return;
      if (!audio.paused) {
        audio.pause();                 // 'pause' 이벤트가 UI를 갱신. 위치는 유지된다.
        announce('배경음악을 껐습니다.');
      } else {
        tryPlay();
        announce('배경음악을 켭니다.');
      }
    });

    // 진입 시 한 번만 자동 재생 시도
    setPlayingUI(false);
    tryPlay();
  }
})();
