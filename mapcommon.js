// mapcommon.js — PC 지도 map.html(카카오)·Vmap.html(브이월드) 공통 코드 (2026-10-04 분리)
// 두 페이지 모두 <head> 의 첫 인라인 스크립트보다 먼저 <script src="mapcommon.js"> 로 불러온다.
//  - 여기 함수가 쓰는 페이지 변수(map/vmap, allItems, markers …)는 실행 시점에 찾으므로 페이지 쪽 선언이 뒤에 있어도 된다.
//  - 지도 API 가 다른 곳은 페이지마다 둔 어댑터(_mapReady·_mapRelayout·_setMapCursor)를 부른다.
//  - Github용 배포본은 페이지 안에서 _apiKeyError 를 덮어쓴다 → 이 파일이 반드시 먼저 실행돼야 한다.
// 배포: Github용_생성.py 가 Github용/ 에 같이 복사, 저장소 junty75/map 에 map.html·Vmap.html 과 함께 올린다.
// 고칠 땐 이 파일 하나만 — 두 페이지에 같은 이름 함수를 다시 만들지 말 것(나중 것이 덮어쓴다).

function _askApiKey(storeKey, name, guide){
    // 1순위: 이 기기에 저장된 키 (사용자가 직접 입력했거나 URL 해시로 받은 키).
    //   api_keys.js 파일 키를 1순위로 쓰면 파일 키가 죽은 키일 때 정상 키를 입력해도
    //   매번 파일 키로 덮어써 계속 실패했음 -> 저장된 키 우선. (재입력: ?resetkey)
    var k = '';
    try { k = (localStorage.getItem(storeKey) || '').trim(); } catch(e){}
    if (k) return k;
    // 2순위: api_keys.js 의 키 (로딩 실패 이력이 있으면 건너뜀)
    try {
      if (window.JTY_API_KEYS && window.JTY_API_KEYS[storeKey]
          && !sessionStorage.getItem('badkey_' + storeKey)) {
        var fk = String(window.JTY_API_KEYS[storeKey]).trim();
        if (fk && fk !== localStorage.getItem('badfilekey_' + storeKey)) {
          try { localStorage.setItem(storeKey, fk); } catch(e){} return fk;
        }
      }
    } catch(e){}
    // 3순위: 직접 입력
    while (!k || !k.trim()) {
      k = prompt(name + ' API 키를 입력하세요. (최초 1회, 이 기기에 저장됨)\n\n' + guide);
      if (k === null) alert(name + ' 키가 없으면 지도를 표시할 수 없습니다.');
    }
    k = k.trim();
    localStorage.setItem(storeKey, k);
    return k;
  }

function _apiKeyError(storeKey, name){
    // 일시적 네트워크/차단 문제일 수 있으니 한 번은 조용히 재시도.
    // 그래도 실패하면 물어보되, [취소]하면 저장된 키를 지우지 않는다
    // (키가 정상인데도 실행할 때마다 키를 다시 입력하게 되던 문제 방지).
    try {
      if (!sessionStorage.getItem('sdkretry_' + storeKey)) {
        sessionStorage.setItem('sdkretry_' + storeKey, '1');
        location.reload();
        return;
      }
    } catch(e){}
    if (confirm(name + ' 로딩 실패 — 인터넷 연결 또는 키 문제일 수 있습니다.\n\n'
        + '[확인] 키를 다시 입력    [취소] 저장된 키 유지(그대로 진행)')) {
      try {
        var bad = localStorage.getItem(storeKey);
        if (bad) localStorage.setItem('badfilekey_' + storeKey, bad);  // 이 키는 다음 실행부터 자동사용 안 함
        sessionStorage.setItem('badkey_' + storeKey, '1');
      } catch(e){}
      localStorage.removeItem(storeKey);
      location.reload();
    }
  }

// 상위 행정구역 제거. 단 (광역시 아닌) 시·군 명칭은 유지.
//  · 도 → 제거, 그 아래 시·군은 유지
//  · 특별시/광역시/특별자치시 → 제거하고 그 아래 구도 제거
function trimRegion(parts) {
  let i = 0;
  if (/도$/.test(parts[0] || '')) {
    i++;
  } else if (/(특별시|광역시|특별자치시)$/.test(parts[0] || '')) {
    i++;
    if (/구$/.test(parts[i] || '')) i++;
  }
  return parts.slice(i);
}

// ── Geohash 인코딩 (표준 base32, 기본 8자리 ≈ ±19m) ──
function geohashEncode(lat, lng, prec) {
  prec = prec || 8;
  const b32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  let idx = 0, bit = 0, evenBit = true, gh = '';
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180;
  while (gh.length < prec) {
    if (evenBit) { const mid = (lngMin + lngMax) / 2; if (lng >= mid) { idx = idx * 2 + 1; lngMin = mid; } else { idx = idx * 2; lngMax = mid; } }
    else { const mid = (latMin + latMax) / 2; if (lat >= mid) { idx = idx * 2 + 1; latMin = mid; } else { idx = idx * 2; latMax = mid; } }
    evenBit = !evenBit;
    if (++bit === 5) { gh += b32[idx]; bit = 0; idx = 0; }
  }
  return gh;
}

function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function _metaIsEditablePhoto(item) {
  return !!(item && item.path && /\.(jpe?g|tiff?)$/i.test(item.path));
}

function updateMetaPanel(item) {
  _metaItem = item;
  _metaSm = null;
  // 사진은 item.path, KMZ에서 생성된 항목은 _srcKmz(KMZ 디스크 경로)로 메타 조회
  _metaReqPath = item ? (item.path || item._srcKmz || '') : '';
  const eb = document.getElementById('metaEditBtn');
  if (eb) eb.disabled = !_metaIsEditablePhoto(item);   // 사진만 수정 가능
  renderMeta(item, null);   // 우선 가진 정보로 즉시 표시
  if (_metaReqPath && window.__wsReady && window.__wsReady())
    window.__wsSend({ type: 'get_file_meta', path: _metaReqPath });
}

// 메타 수정 모달 열기 (현재 선택 사진의 제목·설명 입력)
function openMetaEdit() {
  if (!_metaIsEditablePhoto(_metaItem)) return;
  const m = document.getElementById('metaEditModal');
  // 저장된 제목이 있으면 그걸, 없으면 빈칸(사진 파일명을 기본값으로 넣지 않음)
  document.getElementById('metaEditTitle').value = (_metaSm && _metaSm.title) || '';
  document.getElementById('metaEditDesc').value  = (_metaSm && _metaSm.desc) || '';
  m._path = _metaItem.path;
  m.style.display = 'flex';
  setTimeout(() => document.getElementById('metaEditTitle').focus(), 30);
}

function saveMetaEdit() {
  const m = document.getElementById('metaEditModal');
  if (!m._path) return;
  // 서버(사진위치표시.py)로 전송. 미연결이면 조용히 닫지 말고 알림 + 모달 유지(입력 보존).
  const sent = window.__wsSend && window.__wsSend({
    type: 'save_photo_meta', path: m._path,
    title: document.getElementById('metaEditTitle').value,
    desc:  document.getElementById('metaEditDesc').value
  });
  if (!sent) {
    window.__setBadge && window.__setBadge(false, '❌ 서버 미연결 — 저장 못함(사진위치표시 실행 확인)');
    alert('서버에 연결되어 있지 않아 저장할 수 없습니다.\n사진위치표시(파이썬)가 실행 중인지 확인하세요.');
    return;
  }
  m.style.display = 'none';
  window.__setBadge && window.__setBadge(true, '💾 메타정보 저장 중…');
}

function renderMeta(item, sm) {
  const body = document.getElementById('metaBody');
  if (!body) return;
  if (!item) { body.innerHTML = '<span id="metaPlaceholder">항목을 선택하세요</span>'; return; }
  const rows = [];
  const add = (k, v) => { if (v !== undefined && v !== null && String(v).trim() !== '') rows.push([k, String(v)]); };
  // 제목 — 사진은 서버가 읽은 저장 제목. KMZ 파일은 파일명을 제목으로 쓰지 않음(저장 메타 없으면 공란).
  if (sm && 'title' in sm) add('제목', sm.title || '(제목 없음)');
  else if (item.type !== 'kmz') add('제목', item.name);
  // 트랙(선)이면 전체연장 표시 (사이드바에서 트랙 선택 시 하단 메타창에 나타남)
  if (item.type === 'track' && typeof getTrackTotalLength === 'function') { const L = getTrackTotalLength(item); if (L > 0) add('전체연장', fmtLen(L)); }
  add('촬영일시', (sm && sm.taken) || item.takenDate);
  if (sm) add('설명', sm.desc);
  // KMZ 엑셀로 따로 저장한 메타(헤더:값)
  if (sm && sm.excelMeta) for (const k in sm.excelMeta) add(k, sm.excelMeta[k]);
  body.innerHTML = rows.length
    ? '<table>' + rows.map(([k, v]) => `<tr><th>${escHtml(k)}</th><td>${escHtml(v)}</td></tr>`).join('') + '</table>'
    : '<span id="metaPlaceholder">표시할 메타정보 없음</span>';
}

// ── 저장 결과 토스트 ──
function showSaveStatus(msg, ok=true) {
  let el = document.getElementById('_saveToast');
  if (!el) {
    el = document.createElement('div');
    el.id = '_saveToast';
    el.style.cssText = 'position:fixed;bottom:54px;left:50%;transform:translateX(-50%);padding:7px 16px;border-radius:6px;font-size:13px;z-index:99999;pointer-events:none;opacity:0;transition:opacity .25s;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.3);';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.background = ok ? 'rgba(39,174,96,.93)' : 'rgba(192,57,43,.93)';
  el.style.color = '#fff';
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, ok ? 2200 : 4000);
}

// ── 사진 이름 → EXIF 저장 (3가지 경로 우선순위) ──
//   1) 서버 연동 사진(item.path 있음): 서버가 원본 파일 EXIF만 갱신 (고화질 보존)
//   2) 드래그&드롭 사진(fileHandle 있음): 브라우저가 직접 파일 덮어쓰기
//   3) 둘 다 없음: 메모리 imgSrc EXIF만 갱신 (내보내기 시 포함)
async function savePhotoName(item, newName) {
  // (1) 서버 경로가 있으면 — 서버에 위임 (원본 고화질 그대로, 수정날짜 갱신됨)
  if (item.path && window.__wsSend) {
    const sent = window.__wsSend({ type:'update_name', path:item.path, name:newName });
    if (sent) {
      showSaveStatus('💾 저장 중… ' + item.path.split(/[\\/]/).pop());
      return; // 결과는 서버의 name_saved 메시지에서 표시
    }
    showSaveStatus('🔴 서버 연결 안됨 — 메타데이터 저장 실패', false);
    return;
  }

  // (2)/(3) 메모리 imgSrc(JPEG)에 EXIF 기록
  if (!(item.imgSrc && item.imgSrc.startsWith('data:image/jpeg'))) {
    showSaveStatus('ℹ️ JPEG가 아니어서 메타데이터 저장 안 함');
    return;
  }
  let exifBytes;
  try {
    let old = null;
    try { old = piexif.load(item.imgSrc); } catch(e) { console.warn('piexif.load 무시:', e); }
    const exif = {'0th':{}, 'Exif':{}, 'GPS':{}, '1st':{}, 'thumbnail':null};
    if (old) {
      if (old['GPS']) exif['GPS'] = old['GPS'];
      const ori = old['0th']?.[piexif.ImageIFD.Orientation];
      if (ori !== undefined) exif['0th'][piexif.ImageIFD.Orientation] = ori;
      const dto = old['Exif']?.[piexif.ExifIFD.DateTimeOriginal];
      if (dto !== undefined) exif['Exif'][piexif.ExifIFD.DateTimeOriginal] = dto;
      const dt = old['0th']?.[piexif.ImageIFD.DateTime];
      if (dt !== undefined) exif['0th'][piexif.ImageIFD.DateTime] = dt;
    }
    // ImageDescription은 ASCII 필드 — piexif.js가 한글을 하위바이트만 남겨 깨뜨림(꿀뷰 등에서 깨져 보임)
    // → ASCII일 때만 기록. 한글 이름은 XPTitle에 보존되고, 서버 연결 시엔 서버가 CP949로 기록.
    if (/^[\x00-\x7F]*$/.test(newName)) exif['0th'][piexif.ImageIFD.ImageDescription] = newName;
    const utf16le = [];
    for (let i = 0; i < newName.length; i++) { const c = newName.charCodeAt(i); utf16le.push(c & 0xff, (c >> 8) & 0xff); }
    utf16le.push(0, 0);
    exif['0th'][40091] = utf16le; // XPTitle
    try { exifBytes = piexif.dump(exif); }
    catch(e) { console.warn('dump 재시도(XPTitle 제외):', e); delete exif['0th'][40091]; exifBytes = piexif.dump(exif); }
    let base = item.imgSrc;
    try { base = piexif.remove(item.imgSrc); } catch(e) {}
    item.imgSrc = piexif.insert(exifBytes, base);
    const _mo = item.markerObj || item.mkObj;   // 카카오 판 markerObj / 브이월드 판 mkObj
    if (_mo && 'imgSrc' in _mo) _mo.imgSrc = item.imgSrc;   // 마커 말풍선 사진도 새 EXIF 로
  } catch(e) {
    console.error('EXIF 처리 실패 상세:', e);
    showSaveStatus('❌ EXIF 처리 실패: ' + (e && e.message ? e.message : e), false);
    return;
  }

  // 드래그&드롭 파일 핸들이 있으면 원본 파일에 직접 덮어쓰기
  const fh = item.fileHandle || (item.markerObj || item.mkObj)?.fileHandle;
  if (fh && fh.kind === 'file') {
    try {
      const b64 = item.imgSrc.split(',')[1];
      const bin = atob(b64);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      const writable = await fh.createWritable();
      await writable.write(new Blob([buf], {type:'image/jpeg'}));
      await writable.close();
      showSaveStatus('✅ 파일 저장됨 · 수정날짜 갱신됨 — ' + fh.name);
    } catch(ex) {
      console.error('파일 직접저장 실패:', ex);
      showSaveStatus('⚠️ 직접저장 실패: ' + ex.message + ' (내보내기로 저장하세요)', false);
    }
  } else {
    showSaveStatus('💾 메타데이터 반영됨 (파일저장: 내보내기로 저장하세요)');
  }
}

// 이름정리 대상 판별: 사용자가 직접 붙인 이름은 그대로 두고,
// 자동 생성된 기본 이름(붙여넣기_*, 사진 파일명, 트랙N/경로 N)만 바꾼다.
function isDefaultName(nm){
  nm = (nm || '').trim();
  if (!nm) return true;
  if (/^붙여넣기_/.test(nm)) return true;                                     // Ctrl+V 붙여넣기 기본명
  if (/\.(jpe?g|png|gif|bmp|webp|heic|heif|tiff?)$/i.test(nm)) return true;   // 사진 파일명
  if (/^트랙\s*\d+$/.test(nm)) return true;                                   // Vmap 기본 트랙명
  if (/^경로\s*\d+$/.test(nm)) return true;                                   // map 기본 트랙명
  return false;
}

function _colShown(k) { return (k === 'num' || k === 'name') ? true : colVis[k] !== false; }

function applyColHeaders() {
  let sum = 0; for (const k of _colOrder) if (_colShown(k)) sum += colW[k];
  if (!sum) sum = 1;
  for (const k of _colOrder) {
    const el = document.getElementById(_colThId[k]); if (!el) continue;
    if (_colShown(k)) { el.style.display = ''; el.style.width = (colW[k] / sum * 100).toFixed(2) + '%'; }
    else el.style.display = 'none';
  }
}

function applyColVis() { applyColHeaders(); renderList(); }

function saveColVis() { if (window.__saveUi) window.__saveUi('colvis', JSON.stringify(colVis)); }

function saveColW() { if (window.__saveUi) window.__saveUi('colw', JSON.stringify(colW)); }

// 지도 이동/확대 시 라이브 갱신 (선택은 객체 기준으로 유지)
function refreshViewFilterList(){
  if(!viewFilterOn)return;
  const sel=new Set([...selectedItems].map(i=>_lastFiltered[i]).filter(Boolean));
  renderList();
  selectedItems.clear();
  _lastFiltered.forEach((it,i)=>{if(sel.has(it))selectedItems.add(i);});
  document.querySelectorAll('#photoTbody tr').forEach((r,i)=>r.classList.toggle('selected',selectedItems.has(i)));
  if(typeof updateTrackHighlights==='function')updateTrackHighlights();
}

// 사진 이미지를 클립보드에 복사 (ClipboardItem 에 Promise 전달 → 사용자 제스처 유지, PNG 변환)
function copyPhotoImageToClipboard(item) {
  const src = item && item.imgSrc;
  if (!src) return;
  try {
    const blobPromise = (async () => {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      return await new Promise(r => c.toBlob(r, 'image/png'));
    })();
    navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })])
      .then(() => window.__setBadge && window.__setBadge(true, '🖼 사진 복사됨 (클립보드)'))
      .catch(err => { console.warn('이미지 클립보드 복사 실패', err); window.__setBadge && window.__setBadge(true, '⚠️ 사진 복사 실패'); });
  } catch (e) { console.warn(e); }
}

// ── 드롭 사진 중복 방지 + 디스크경로 확보 ──
// 이미 영구 삽입된 같은 파일(파일명)이 있으면 true — 재삽입(드래그) 중복을 막는다.
function hasItemByFileName(fileName) {
  const base = String(fileName || '').toLowerCase();
  if (!base) return false;
  return allItems.some(it => it.type === 'photo' && !it._live && (
    (it.path && String(it.path).toLowerCase().split(/[\\/]/).pop() === base) ||
    (it._fname && String(it._fname).toLowerCase() === base)
  ));
}

function requestPathResolve(item, fileName) {
  if (!item || item.path || !fileName) return;
  item._fname = fileName;
  if (!(window.__wsReady && window.__wsReady())) return;
  _pendingPathResolve.push(item);
  window.__wsSend({ type: 'resolve_paths', names: [fileName] });
}

// 서버 응답(resolved_paths) 처리 — 파일명→경로 매핑을 대기 항목에 반영
function applyResolvedPaths(map) {
  const still = [];
  for (const it of _pendingPathResolve) {
    const b = (it._fname || '').toLowerCase();
    if (map && map[b]) { if (!it.path) it.path = map[b]; }
    else still.push(it);
  }
  _pendingPathResolve = still;
}

// ── 사이드바 토글 ──
function openSidebar() {
  const sb = document.getElementById('sidebar');
  if (getComputedStyle(sb).display !== 'none') return;   // 이미 열려 있으면 그대로 유지
  sb.style.display = 'flex';
  document.getElementById('sidebarResizer').style.display = 'block';
  document.getElementById('sidebarOpenBtn').textContent = '◀';
  setTimeout(_mapRelayout, 50);   // 지도 크기 다시 계산 (페이지별 어댑터)
}

function closeSidebar() {
  document.getElementById('sidebar').style.display = 'none';
  document.getElementById('sidebarResizer').style.display = 'none';
  document.getElementById('sidebarOpenBtn').textContent = '▶';
  setTimeout(_mapRelayout, 50);
}

function setLivePreview(imgSrc) {
  openSidebar();
  const img = document.getElementById('previewImg');
  const ph  = document.getElementById('previewPlaceholder');
  img.src = imgSrc; img.style.display = 'block'; ph.style.display = 'none';
  _livePreviewOn = true;
}

function clearLivePreview() {
  if (!_livePreviewOn) return;
  _livePreviewOn = false;
  const img = document.getElementById('previewImg');
  const ph  = document.getElementById('previewPlaceholder');
  img.style.display = 'none'; img.src = '';
  ph.style.display = ''; ph.textContent = '항목을 선택하세요';
}

// ── XPTitle (UTF-16LE) → 문자열 변환 ──
function xpTitleToStr(bytes) {
  if (!bytes || bytes.length < 2) return '';
  let s = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const code = bytes[i] | (bytes[i + 1] << 8);
    if (code === 0) break;
    s += String.fromCharCode(code);
  }
  return s.trim();
}

// EXIF에서 저장된 이름 읽기 (XPTitle → ImageDescription 순)
function readMetaName(exifObj) {
  try {
    const xpRaw = exifObj['0th']?.[40091]; // XPTitle
    if (xpRaw && xpRaw.length > 2) { const n = xpTitleToStr(xpRaw); if (n) return n; }
    const desc = (exifObj['0th']?.[piexif.ImageIFD.ImageDescription] || '').trim();
    if (desc) return desc;
  } catch(e) {}
  return '';
}

// ── 엑셀 선택 삽입 — 서버가 엑셀 선택 셀(파일경로)을 직접 읽어 삽입 ──
//    (클립보드 복사 불필요, 글로벌 키보드 훅 없음 → IME/클립보드 충돌 없음)
// 임시(흐리게 표시된) 객체를 영구 객체로 확정 삽입
function insertLiveObjects() {
  if (window.__promoteLive) window.__promoteLive();
}

// 검색 결과창에서 체크해 둔 파일 경로들 (없으면 빈 배열)
function getCheckedSearchPaths() {
  const modal = document.getElementById('searchResultModal');
  if (!modal || modal.style.display === 'none') return [];
  return [...modal.querySelectorAll('.sr-check')]
    .filter(c => c.checked && c._item && c._item.path).map(c => c._item.path);
}

// 검색 결과에서 체크한 파일들을 서버에서 받아 사이드바에 영구 삽입.
//  임시(live) 객체로 먼저 올라오고 — KMZ 는 브라우저에서 푸는 데 시간이 걸리므로
//  개수가 더 안 늘어날 때까지 기다렸다가 확정한다.
async function insertCheckedSearchItems(paths) {
  if (!(window.__wsReady && window.__wsReady())) {
    alert('탐색기 연동 서버(사진위치표시.py)가 실행 중이어야 합니다.'); return;
  }
  window.__setBadge && window.__setBadge(true, `⬇ ${paths.length}개 삽입 준비 중…`);
  window.__wsSend({ type: 'preview_files', paths });
  const t0 = Date.now();
  let last = -1, stable = 0;
  while (Date.now() - t0 < 20000) {
    await new Promise(r => setTimeout(r, 200));
    const n = allItems.filter(i => i._live).length;
    if (n > 0 && n === last) { if (++stable >= 3) break; }   // 0.6초간 변화 없으면 완료
    else stable = 0;
    last = n;
  }
  if (!allItems.some(i => i._live)) {
    window.__setBadge && window.__setBadge(true, '⚠️ 삽입할 객체를 받지 못했습니다');
    return;
  }
  insertLiveObjects();
}

// 위치로 검색 진행 표시 토글 (서버 search_running 메시지로 제어)
function setSearchRunning(on, msg) {
  const box = document.getElementById('searchRunning');
  if (!box) return;
  if (on) {
    document.getElementById('searchRunningMsg').textContent = msg || '🧭 검색 중…';
    box.classList.add('on');
  } else {
    box.classList.remove('on');
  }
}

// 검색 진행 중인지 (Esc 중단 판정용)
function isSearchRunning() {
  const box = document.getElementById('searchRunning');
  return !!(box && box.classList.contains('on'));
}

// 중단 요청 — 서버에 검색 중단 신호 (버튼 / Esc 공용)
function cancelRunningSearch() {
  if (!isSearchRunning()) return false;
  window.__wsSend && window.__wsSend({ type: 'cancel_search' });
  document.getElementById('searchRunningMsg').textContent = '⏹ 중단하는 중…';
  return true;
}

// 메타색인 진행 표시
function setReindexRunning(on, msg) {
  const box = document.getElementById('reindexStatus');
  if (!box) return;
  if (on) {
    document.getElementById('reindexMsg').textContent = msg || '🗂 색인 중…';
    box.style.display = 'inline-flex';
  } else {
    box.style.display = 'none';
  }
}

// 검색 결과에서 체크된 항목들을 지정한 폴더에 복사 저장 (서버가 폴더 선택창 띄움)
function saveSearchItems(sel) {
  const paths = sel.map(it => it.path).filter(Boolean);
  if (!paths.length) { alert('저장할 파일 경로가 없습니다.'); return; }
  window.__wsSend({ type: 'save_files_to_folder', paths });
  window.__setBadge && window.__setBadge(true, `💾 ${paths.length}개 — 저장 폴더 선택 중…`);
}

function _jusoKakaoOnce(api, q) {
  return new Promise(resolve => {
    try {
      const S = kakao.maps.services;
      const done = (res, st) => resolve(st === S.Status.OK && res ? res : []);
      if (api === 'address') new S.Geocoder().addressSearch(q, done, { size: 30 });
      else new S.Places().keywordSearch(q, done, { size: 15 });
    } catch (e) { resolve([]); }
  });
}

function _jusoTier(d) {
  const s = d.addr + '|' + d.road;
  const i = JUSO_TIERS.findIndex(t => t.names.some(n => s.includes(n)));
  return i < 0 ? JUSO_TIERS.length : i;
}

async function _jusoCollect(api, q) {
  // 입력값에 이미 그 지역명이 들어있으면 접두어 검색은 생략
  const qs = JUSO_TIERS.filter(t => !t.names.some(n => q.includes(n))).map(t => t.prefix + ' ' + q);
  qs.push(q);
  const all = (await Promise.all(qs.map(x => _jusoKakaoOnce(api, x)))).flat();
  const seen = new Set(), list = [];
  for (const r of all) {
    const d = {
      name: r.place_name || '',
      addr: r.address_name || '',
      road: r.road_address_name || (r.road_address && r.road_address.address_name) || '',
      lat: parseFloat(r.y), lng: parseFloat(r.x)
    };
    if (!isFinite(d.lat) || !isFinite(d.lng)) continue;
    const k = d.name + '|' + d.addr + '|' + r.x + '|' + r.y;
    if (seen.has(k)) continue;
    seen.add(k); list.push(d);
  }
  list.forEach((d, i) => { d.tier = _jusoTier(d); d._i = i; });
  return list.sort((a, b) => a.tier - b.tier || a._i - b._i);
}

// → { list:[{name,addr,road,lat,lng,tier}], isAddr }  (카카오 SDK 가 없으면 null)
async function jusoSearch(q) {
  if (!(window.kakao && kakao.maps && kakao.maps.services)) return null;
  let list = await _jusoCollect('address', q);
  if (list.length) return { list, isAddr: true };
  list = await _jusoCollect('keyword', q);
  return { list, isAddr: false };
}

function jusoClosePicker() { const b = document.getElementById('jusoPick'); if (b) b.remove(); }

// 결과가 여러 곳이면 검색창 아래에 목록 표시 (1번이 이미 선택된 상태). 행 클릭 = 그 위치로 이동
function jusoShowPicker(anchorEl, res, onPick) {
  jusoClosePicker();
  const list = res.list.slice(0, 30);
  if (list.length <= 1) return;
  const r = anchorEl.getBoundingClientRect();
  const box = document.createElement('div');
  box.id = 'jusoPick';
  box.style.cssText = `position:fixed;left:${r.left}px;top:${r.bottom + 4}px;z-index:100001;background:#fff;border:1px solid #bbb;border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,.3);width:360px;max-width:90vw;max-height:60vh;display:flex;flex-direction:column;font-size:12px;`;
  const hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px 10px;border-bottom:1px solid #e0e0e0;background:#f5f9fc;border-radius:6px 6px 0 0;';
  hdr.innerHTML = `<b>검색결과 ${res.list.length}곳 <span style="font-weight:normal;color:#888;">(장수군→전북→기타 순)</span></b>`;
  const x = document.createElement('button');
  x.textContent = '✕';
  x.style.cssText = 'border:none;background:none;font-size:15px;cursor:pointer;line-height:1;';
  x.onclick = jusoClosePicker;
  hdr.appendChild(x);
  const ul = document.createElement('div');
  ul.style.cssText = 'overflow:auto;flex:1;min-height:0;';
  const colors = ['#c0392b', '#2471a3'];
  const rows = list.map((d, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'padding:5px 10px;cursor:pointer;border-bottom:1px solid #f0f0f0;line-height:1.4;';
    const t = JUSO_TIERS[d.tier];
    const badge = t ? `<span style="display:inline-block;padding:0 4px;margin-right:4px;border-radius:3px;background:${colors[d.tier] || '#777'};color:#fff;font-size:11px;">${t.label}</span>` : '';
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const main = res.isAddr ? esc(d.addr || d.road) : `<b>${esc(d.name)}</b>`;
    const sub  = res.isAddr ? (d.road && d.addr ? esc(d.road) : '') : esc(d.addr || d.road);
    row.innerHTML = `${i + 1}. ${badge}${main}` + (sub ? `<div style="color:#888;font-size:11px;padding-left:14px;">${sub}</div>` : '');
    row.onclick = () => { select(i); onPick(d); };
    row.onmouseenter = () => { if (row.dataset.sel !== '1') row.style.background = '#f3f7fb'; };
    row.onmouseleave = () => { if (row.dataset.sel !== '1') row.style.background = ''; };
    ul.appendChild(row);
    return row;
  });
  function select(i) {
    rows.forEach((rw, j) => { rw.dataset.sel = j === i ? '1' : ''; rw.style.background = j === i ? '#dbeafe' : ''; });
  }
  select(0);
  box.appendChild(hdr); box.appendChild(ul);
  document.body.appendChild(box);
}

function openRoadview(lat, lng) {
  // 카카오지도 사이트를 새 창으로 열어 해당 지점을 스카이뷰(+로드뷰)로 표시한다.
  //  link/roadview API는 스카이뷰 지정이 안 되므로, 실제 map.kakao.com URL을 직접 구성:
  //   map_type=TYPE_SKYVIEW(스카이뷰) + map_attribute=ROADVIEW(로드뷰) + panoid + 내부좌표(urlX/urlY)
  // 팝업차단 회피 위해 사용자 클릭 제스처 안에서 창을 먼저 열고, panoid를 받은 뒤 이동.
  const w = window.open('about:blank', 'kakaoSkyview',
    'width=1100,height=800,scrollbars=yes,resizable=yes');
  if (!w) { alert('팝업이 차단되었습니다. 팝업 허용 후 다시 시도하세요.'); return; }
  try { w.document.write('<title>카카오 스카이뷰</title><body style="font:14px sans-serif;padding:20px;">카카오지도 여는 중…</body>'); } catch(e){}

  // 위경도 → 카카오 내부좌표(WCONGNAMUL)
  let ux = '', uy = '';
  try {
    const co = new kakao.maps.LatLng(lat, lng).toCoords();
    if (co.getX) { ux = Math.round(co.getX()); uy = Math.round(co.getY()); }
    else { const mm = String(co).match(/-?\d+\.?\d*/g); if (mm) { ux = Math.round(+mm[0]); uy = Math.round(+mm[1]); } }
  } catch(e){}

  const base = `map_type=TYPE_SKYVIEW&map_hybrid=true&urlLevel=3&urlX=${ux}&urlY=${uy}`;
  const skyOnly = `https://map.kakao.com/?${base}`;
  try {
    new kakao.maps.RoadviewClient().getNearestPanoId(
      new kakao.maps.LatLng(lat, lng), 50, function(panoId) {
        w.location.href = (panoId != null)
          ? `https://map.kakao.com/?${base}&map_attribute=ROADVIEW&panoid=${panoId}&pan=0&tilt=0&zoom=0`
          : skyOnly;   // 근처 로드뷰 없으면 스카이뷰 지도만
        if (panoId == null) showSaveStatus('이 지점 부근에 로드뷰가 없어 스카이뷰 지도만 엽니다');
      });
  } catch(e) {
    w.location.href = skyOnly;
  }
  w.focus();
}

function startLocationPick() {
  if (!(window.__wsReady && window.__wsReady())) {
    alert('탐색기 연동 서버(사진위치표시.py)가 실행 중이어야 합니다.'); return;
  }
  setSearchRunning(false);   // 이전 검색의 '중단하는 중…' 표시가 남아 있으면 지운다
  if (!_mapReady()) return;
  if (roadviewPickMode) stopRoadviewPick();
  clearLocationPick(false);     // 이전 검색 원 제거
  locPickMode = 'center';
  _setMapCursor('crosshair');
  const b = document.getElementById('kmzNearBtn');
  if (b) { b.style.background = '#2d6cdf'; b.style.color = '#fff'; }
  showSaveStatus('🧭 검색 중심점을 지도에서 클릭하세요 (Esc=취소)');
}

function _saveTextPref(key, val) {
  try { window.__saveUi && window.__saveUi(key, val); } catch (e) {}
}

function _applyTextBox(ta) {
  const m = /^(\d+)x(\d+)$/.exec(textBoxSize || '');
  if (m) { ta.style.width = m[1] + 'px'; ta.style.height = m[2] + 'px'; }
}

function _saveTextBox(ta) {
  if (!ta || !ta.style.height) return;            // 끌어서 바꾼 적이 없으면 기본 크기 유지
  const w = Math.max(80, parseInt(ta.style.width) || 0), h = Math.max(30, parseInt(ta.style.height) || 0);
  const v = w + 'x' + h;
  if (v !== textBoxSize) { textBoxSize = v; _saveTextPref('text_box', v); }
}

function _updateEraseUndoBtn() {
  const b = document.getElementById('eraseUndoBtn');
  if (b) b.style.display = (eraseMode && eraseHistory.length) ? '' : 'none';
}

function _eraseRectEl() {
  if (!_eraseRect) {
    _eraseRect = document.createElement('div');
    _eraseRect.style.cssText = 'position:fixed;z-index:9998;display:none;pointer-events:none;'
      + 'border:2px dashed #e53935;background:rgba(229,57,53,0.12);border-radius:2px;';
    document.body.appendChild(_eraseRect);
  }
  return _eraseRect;
}

// 우클릭 '선택' — 그 선의 사이드바 항목을 선택(강조). 이후 툴바 색상/두께로 변경 가능.
function selectItemInSidebar(item){
  if(!item)return;
  openSidebar();
  let filtered=getFilteredItems();
  if(filtered.indexOf(item)<0){
    // 현재 필터에 안 보이면 '전체'로 전환
    currentFilter='all';
    document.querySelectorAll('.ftab').forEach(b=>b.classList.toggle('active',b.dataset.f==='all'));
    filtered=getFilteredItems();
  }
  const idx=filtered.indexOf(item);
  if(idx<0)return;
  selectedItems.clear(); selectedItems.add(idx); anchorIdx=idx; lastClickedIdx=idx;
  renderList();
  selectFilteredItem(idx);
  updateTrackHighlights();
  const rows=document.querySelectorAll('#photoTbody tr'); if(rows[idx])rows[idx].scrollIntoView({block:'nearest'});
}

function hideColorPalette(){ const p=document.getElementById('colorPalette'); if(p)p.classList.remove('show'); _paletteOnPick=null; }

function openColorPalette(anchorEl, onPick){
  const p=document.getElementById('colorPalette'); if(!p)return;
  _paletteOnPick = onPick;
  p.classList.add('show');   // 크기를 알아야 위치잡음 → 먼저 표시
  const r = anchorEl.getBoundingClientRect();
  const pw = p.offsetWidth||230, ph = p.offsetHeight||90;
  let left = Math.min(r.left, window.innerWidth - pw - 8);
  let top  = r.bottom + 4; if (top + ph > window.innerHeight) top = r.top - ph - 4;
  p.style.left = Math.max(8,left)+'px'; p.style.top = Math.max(8,top)+'px';
}

// 📁 버튼 — 임시트랙 저장폴더 지정/변경
function setTempTrackDir(){
  if(!(window.__wsReady&&window.__wsReady())){
    alert('임시트랙 저장폴더는 PC 프로그램(사진위치표시)과 연결된 상태에서 지정할 수 있습니다.');return;}
  if(window.__setBadge)window.__setBadge(true,'📁 임시트랙 저장폴더 선택...');
  window.__wsSend({type:'set_temp_track_dir'});
}

// ══════════════════════════════════════════════════
//  KMZ→HTM 변환본(내보내기 htm) 읽기
//  이 프로그램이 만든 단독 실행 htm 은 데이터가 JSON 배열로 박혀 있다:
//    var LINES=[{c,o,w,p:[[[lat,lng],..],..],z,n}] 선(멀티파트, n=이름)
//    var POLYS=[{c,o,w,fc,fo,p:[링..],z,n}]        면(첫 링=외곽, 나머지=구멍, n=이름)
//    var TEXTS=[[lat,lng,글자,회전,색,높이m,ax,ay]] CAD 문자
//    var MARKERS=[[lat,lng,이름]] / var PHOTOS=[[lat,lng,이름,dataURI]]
//  dmap/캐드 htm(linePathN 방식)과 형식이 다르므로 이쪽을 먼저 시도한다.
// ══════════════════════════════════════════════════
// var NAME=[ ... ]; 배열을 통째로 떼어내 JSON 으로 파싱 (문자열 안의 대괄호 무시)
function _htmGrabArray(src,name){
  const m=new RegExp('var\\s+'+name+'\\s*=\\s*\\[').exec(src);
  if(!m)return null;
  const start=m.index+m[0].length-1;   // '[' 위치
  let depth=0,inStr=false,q='';
  for(let j=start;j<src.length;j++){
    const ch=src[j];
    if(inStr){ if(ch==='\\'){j++;continue;} if(ch===q)inStr=false; continue; }
    if(ch==='"'||ch==="'"){inStr=true;q=ch;continue;}
    if(ch==='[')depth++;
    else if(ch===']'){ depth--; if(depth===0){ try{return JSON.parse(src.slice(start,j+1));}catch(e){return null;} } }
  }
  return null;
}

// DirectoryReader.readEntries 는 한 번에 100개까지만 준다 → 빈 배열이 올 때까지 반복
function _dropReadAll(reader){
  return new Promise(res=>{
    const out=[];
    const step=()=>reader.readEntries(ents=>{
      if(!ents.length)return res(out);
      out.push(...ents);step();
    },()=>res(out));
    step();
  });
}

// entry(webkitGetAsEntry) 재귀 스캔 — {file, dir} 수집. dir 은 드롭한 폴더 기준 상대경로.
async function _dropScan(entry,dirPath,out,stat){
  if(!entry)return;
  if(entry.isFile){
    stat.seen++;
    if(!DROP_EXT.test(entry.name)){stat.skip++;return;}
    const f=await new Promise(r=>{try{entry.file(r,()=>r(null));}catch(_){r(null);}});
    if(f)out.push({file:f,dir:dirPath,handle:null});else stat.fail++;
  }else if(entry.isDirectory){
    const sub=dirPath?dirPath+'/'+entry.name:entry.name;
    const ents=await _dropReadAll(entry.createReader());
    for(const c of ents)await _dropScan(c,sub,out,stat);
  }
}

// FileSystemHandle 재귀 스캔 — 드롭 이벤트가 끝난 뒤에도 유효해서 entry 방식보다 안정적이다.
// (entry 는 하위폴더를 읽는 도중 무효화돼 파일이 0개로 나오는 경우가 있었다)
async function _dropScanHandle(h,dirPath,out,stat){
  if(!h)return;
  if(h.kind==='file'){
    stat.seen++;
    if(!DROP_EXT.test(h.name)){stat.skip++;return;}
    try{out.push({file:await h.getFile(),dir:dirPath,handle:h});}catch(_){stat.fail++;}
  }else if(h.kind==='directory'){
    const sub=dirPath?dirPath+'/'+h.name:h.name;
    try{for await(const c of h.values())await _dropScanHandle(c,sub,out,stat);}catch(_){stat.fail++;}
  }
}

// 폴더가 여러 개(하위폴더 포함)일 때 어떤 폴더를 삽입할지 고르는 창
function _dropPickFolders(groups){
  return new Promise(resolve=>{
    const keys=[...groups.keys()].sort();
    const total=keys.reduce((s,k)=>s+groups.get(k).length,0);
    const ov=document.createElement('div');
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100000;display:flex;align-items:center;justify-content:center;';
    const box=document.createElement('div');
    box.style.cssText='background:#fff;border-radius:8px;padding:16px 18px;min-width:380px;max-width:min(680px,92vw);max-height:80vh;display:flex;flex-direction:column;font-size:14px;color:#222;box-shadow:0 8px 30px rgba(0,0,0,.35);';
    const head=document.createElement('div');
    head.innerHTML='<div style="font-weight:700;margin-bottom:4px;">📁 삽입할 폴더 선택</div>'
      +'<div style="color:#666;margin-bottom:10px;">하위 폴더에도 파일이 있습니다. 삽입할 폴더를 고르세요 (전체 '+total+'개)</div>';
    const list=document.createElement('div');
    list.style.cssText='overflow:auto;flex:1;border:1px solid #ddd;border-radius:6px;padding:8px;margin-bottom:10px;';
    const boxes=[];
    keys.forEach(k=>{
      const lab=document.createElement('label');
      lab.style.cssText='display:flex;align-items:center;gap:8px;padding:4px 2px;cursor:pointer;';
      const cb=document.createElement('input');cb.type='checkbox';cb.checked=true;cb.value=k;
      const sp=document.createElement('span');
      sp.style.cssText='flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      sp.textContent=k||'(드롭한 파일)';sp.title=k;
      const cnt=document.createElement('span');cnt.style.cssText='color:#888;white-space:nowrap;';
      cnt.textContent=groups.get(k).length+'개';
      lab.append(cb,sp,cnt);list.appendChild(lab);boxes.push(cb);
    });
    const btns=document.createElement('div');
    btns.style.cssText='display:flex;gap:6px;justify-content:flex-end;';
    const mk=(txt,primary)=>{const b=document.createElement('button');b.textContent=txt;
      b.style.cssText='padding:6px 14px;border-radius:5px;cursor:pointer;border:1px solid '
        +(primary?'#2d6cdf;background:#2d6cdf;color:#fff':'#ccc;background:#f7f7f7;color:#333');
      return b;};
    const bAll=mk('전체선택'),bNone=mk('전체해제'),bCancel=mk('취소'),bOk=mk('삽입',true);
    bAll.style.marginRight='auto';
    bAll.onclick=()=>boxes.forEach(c=>c.checked=true);
    bNone.onclick=()=>boxes.forEach(c=>c.checked=false);
    const close=v=>{document.removeEventListener('keydown',onKey,true);ov.remove();resolve(v);};
    bCancel.onclick=()=>close(null);
    bOk.onclick=()=>close(boxes.filter(c=>c.checked).map(c=>c.value));
    const onKey=ev=>{if(ev.key==='Escape'){ev.stopPropagation();close(null);}};
    document.addEventListener('keydown',onKey,true);
    ov.addEventListener('click',ev=>{if(ev.target===ov)close(null);});
    btns.append(bAll,bNone,bCancel,bOk);
    box.append(head,list,btns);ov.appendChild(box);document.body.appendChild(ov);
    bOk.focus();
  });
}

// 드롭된 entry 들을 스캔해 실제로 삽입할 File 목록을 만든다.
// 주의: DataTransfer 는 이벤트가 끝나면 무효 → 스캔(파일 확보)을 먼저 끝내고 나서 선택창을 띄운다.
async function collectDroppedFolderFiles(entries,handlePromises){
  let out=[];const stat={seen:0,skip:0,fail:0};
  for(let i=0;i<entries.length;i++){
    const en=entries[i];
    let h=null;
    try{h=(handlePromises&&handlePromises[i])?await handlePromises[i]:null;}catch(_){h=null;}
    if(h&&h.kind)await _dropScanHandle(h,'',out,stat);
    else await _dropScan(en,'',out,stat);
  }
  // 핸들 방식이 실패했으면(권한 등) entry 방식으로 한 번 더
  if(!out.length&&entries.some(en=>en)){
    const st2={seen:0,skip:0,fail:0};
    for(const en of entries)await _dropScan(en,'',out,st2);
    stat.seen+=st2.seen;stat.skip+=st2.skip;stat.fail+=st2.fail;
  }
  const groups=new Map();
  out.forEach(o=>{if(!groups.has(o.dir))groups.set(o.dir,[]);groups.get(o.dir).push(o);});
  if(!groups.size){
    alert('폴더 안에 지도에 표시할 수 있는 파일이 없습니다.\n\n'
      +`검사한 파일 ${stat.seen}개 / 지원하지 않는 형식 ${stat.skip}개 / 읽기 실패 ${stat.fail}개\n`
      +'읽기 실패가 있으면 클라우드(드롭박스·원드라이브) 온라인 전용 파일일 수 있습니다.\n'
      +'해당 폴더를 "로컬에 항상 유지"로 내려받은 뒤 다시 시도하세요.');
    return [];
  }
  if(groups.size>1){
    const sel=await _dropPickFolders(groups);
    if(!sel||!sel.length)return [];
    const set=new Set(sel);
    out=out.filter(o=>set.has(o.dir));
  }
  return out;
}

// ══════════════════════════════════════════════════
//  KMZ 로딩
// ══════════════════════════════════════════════════
// .bgpx(이진 GPX, 'Bgpx' 헤더) → GPX 텍스트. 사진위치표시.py 의 _bgpx_track · img/gdrive.js 와 같은 해석
//  (역분석 — 2026-10-01 실제 파일 22개로 검증: 끝까지 어긋남 없이 읽힘).
//  'Bgpx' + 파일크기(4, 빅엔디언) + 가변정수 머리말 + 문자열 2개(트랙 이름 'Track 2026-08-03 13:10', 종류 '기본 트랙') 뒤
//  가변정수 [기준시각, 0, 1, 점수, 사진수?, 1, 점수, 위도, 경도, 고도, 시각] 다음 점마다 차분 [?, d위도, d경도, d고도, d시각].
//  머리말: 새 형식 [2, 0, 1](3개), 2023년 무렵 옛 형식 [0](1개) — 나머지 구조는 같다(2026-10-04 track20231114_613.bgpx 로 확인).
//  → 새 형식 → 옛 형식 순으로 읽어 보고 좌표가 정상인 쪽을 쓴다.
//  그 뒤에 사진 웨이포인트(좌표 + '20260803_132101.jpg' 같은 이름) 구역이 있으나 여기선 읽지 않는다.
//  가변정수 = 큰 쪽부터 7비트씩, 0x80 이어짐. 부호 있는 값(좌표·차분)은 첫 바이트 0x40 이 음수,
//  부호 없는 값(헤더의 개수·시각)은 첫 바이트 7비트를 다 쓴다(8192점 넘는 파일에서 차이가 난다).
//  위경도 1e-7 도, 고도 0.1 m, 시각 = 2020-01-01 UTC 부터 초.
function _bgpxToGpx(u8){
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const T0=Date.UTC(2020,0,1)/1000;
  const pt=(la,lo,el,t)=>`<trkpt lat="${(la/1e7).toFixed(7)}" lon="${(lo/1e7).toFixed(7)}"><ele>${(el/10).toFixed(1)}</ele><time>${new Date((T0+t)*1000).toISOString().replace('.000Z','Z')}</time></trkpt>`;
  const parse=prefix=>{            // prefix = 이름 앞 가변정수 개수 (새 형식 3, 옛 형식 1)
    let pos=8;
    const vlq=(signed=true)=>{
      if(pos>=u8.length)throw new RangeError('bgpx 끝');
      let b=u8[pos++];const neg=signed&&(b&0x40);let v=b&(signed?0x3f:0x7f);
      while(b&0x80){if(pos>=u8.length)throw new RangeError('bgpx 끝');b=u8[pos++];v=v*128+(b&0x7f);}
      return neg?-v:v;
    };
    const str=()=>{const n=vlq(false);if(n>200)throw new Error('이름 길이 이상');const s=new TextDecoder('utf-8',{fatal:true}).decode(u8.subarray(pos,pos+n));pos+=n;return s;};
    let name='';const pts=[];
    try{
      for(let p=0;p<prefix;p++)vlq(false);
      name=str();str();                                    // 트랙 이름 + 종류
      const h=[];for(let i=0;i<11;i++)h.push(vlq(i>=7));   // 앞 7개(시각·개수)는 부호 없음
      let [n,lat,lon,ele,t]=[h[3],h[7],h[8],h[9],h[10]];
      if(!n||Math.abs(lat)>9e8||Math.abs(lon)>18e8||(!lat&&!lon))return null;
      pts.push(pt(lat,lon,ele,t));
      for(let k=1;k<n;k++){
        const r=[vlq(),vlq(),vlq(),vlq(),vlq()];
        lat+=r[1];lon+=r[2];ele+=r[3];t+=r[4];
        pts.push(pt(lat,lon,ele,t));
      }
    }catch(e){if(!(e instanceof RangeError))return null;}   // 잘린 파일 — 읽은 데까지만
    return pts.length?{name,pts}:null;
  };
  const r=parse(3)||parse(1)||parse(2);
  if(!r)throw new Error('bgpx 형식을 읽지 못했습니다');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="bgpx" xmlns="http://www.topografix.com/GPX/1/1">\n<trk><name>${esc(r.name||'트랙')}</name><trkseg>\n${r.pts.join('\n')}\n</trkseg></trk>\n</gpx>\n`;
}

// ── 사진 위치·촬영일 보조 읽기 (2026-10-04) ──
// piexif 는 JPEG 전용이고 삼성·아이폰의 큰 MakerNote, XMP 에 든 위치를 놓친다(휴대폰판 readPhotoMetaFallback 과 같은 이유).
// piexif 가 못 읽으면 원본 File 을 exifr 로 다시 읽는다. dataURL 말고 원본 File/Blob 을 넘길 것(청크 단위로 읽음).
async function _exifrMeta(file){
  const out={lat:null,lng:null,date:''};
  if(typeof exifr==='undefined')return out;
  try{
    const ex=await exifr.parse(file,{gps:true,xmp:true,tiff:true,exif:true}).catch(()=>null);
    let la=ex&&ex.latitude,lo=ex&&ex.longitude;
    if(!isFinite(la)||!isFinite(lo)){const g=await exifr.gps(file).catch(()=>null);if(g){la=g.latitude;lo=g.longitude;}}
    if(isFinite(la)&&isFinite(lo)&&(la||lo)){out.lat=la;out.lng=lo;}
    const d=ex&&(ex.DateTimeOriginal||ex.CreateDate);
    if(d instanceof Date&&!isNaN(d))out.date=_ymdLocal(d);
  }catch(e){}
  return out;
}

// 촬영일 'YYYY-MM-DD' — exifr 는 촬영 시각을 현지 시각 Date 로 준다. toISOString() 은 UTC 라 오전 사진이 전날로 밀린다.
function _ymdLocal(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}

// GPX → KML 텍스트. 위치로 검색·탐색기에서 온 GPX(임시트랙 등)를 KMZ 로더로 그대로 읽기 위함.
//  트랙(trk/trkseg)·경로(rte) → LineString, 웨이포인트(wpt) → Point.
//  선 색·굵기는 gpx_style 확장(<color>RRGGBB</color><width>)이 있으면 살린다(임시트랙 자동저장이 씀).
function _gpxToKml(text){
  const xml=new DOMParser().parseFromString(text,'application/xml');
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const child=(el,tag)=>Array.from(el.children).find(c=>c.localName===tag);
  const all=(el,tag)=>Array.from(el.getElementsByTagNameNS('*',tag));
  const ll=p=>`${p.getAttribute('lon')},${p.getAttribute('lat')},0`;
  let styles='',pms='',sn=0;
  const line=(el,segs,idx)=>{
    segs=segs.filter(s=>s.length>=2);
    if(!segs.length)return;
    let su='';
    const ex=child(el,'extensions');
    if(ex){
      const c=((all(ex,'color')[0]||{}).textContent||'').trim().replace('#','');
      const w=parseFloat((all(ex,'width')[0]||{}).textContent)||3;
      if(/^[0-9a-f]{6}$/i.test(c)){
        const id='gs'+(sn++);
        styles+=`<Style id="${id}"><LineStyle><color>ff${c.slice(4,6)}${c.slice(2,4)}${c.slice(0,2)}</color><width>${w}</width></LineStyle></Style>\n`;
        su=`<styleUrl>#${id}</styleUrl>`;
      }
    }
    const g=segs.map(s=>`<LineString><coordinates>${s.map(ll).join(' ')}</coordinates></LineString>`);
    const nm=esc((child(el,'name')||{}).textContent||('경로'+idx));
    pms+=`<Placemark><name>${nm}</name>${su}${g.length===1?g[0]:'<MultiGeometry>'+g.join('')+'</MultiGeometry>'}</Placemark>\n`;
  };
  all(xml,'trk').forEach((t,i)=>line(t,all(t,'trkseg').map(s=>all(s,'trkpt')),i+1));
  all(xml,'rte').forEach((r,i)=>line(r,[all(r,'rtept')],i+1));
  all(xml,'wpt').forEach(p=>{
    pms+=`<Placemark><name>${esc((child(p,'name')||{}).textContent||'')}</name><Point><coordinates>${ll(p)}</coordinates></Point></Placemark>\n`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document>\n${styles}${pms}</Document></kml>`;
}

function dirOf(p){ return p ? p.replace(/[\\/][^\\/]*$/, '') : ''; }

function baseName(p){ return p ? p.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '') : ''; }

// 저장 prompt 기본값: 기준 사진 이름(있으면) → 없으면 fallback
function defaultSaveName(fallback){
  const t = resolveSaveTarget();
  return t.base || fallback;
}

// 반환: {folder,filename} / 취소 '' / 서버 미연결 undefined
function askSavePath(defName){
  if (!(window.__wsReady && window.__wsReady())) return Promise.resolve(undefined);
  const reqid = 'p' + (++_pickSeq);
  window.__setBadge && window.__setBadge(true, '💾 저장 위치 선택...');
  return new Promise(res => {
    _pickWaiters.set(reqid, res);
    window.__wsSend({ type:'pick_save_path', reqid, filename:defName,
                      suggested: resolveSaveTarget().folder || '' });
  });
}

// 반환: 폴더 경로 / 취소 '' / 서버 미연결 undefined
function askSaveFolder(title, key){
  if (!(window.__wsReady && window.__wsReady())) return Promise.resolve(undefined);
  const reqid = 'd' + (++_pickSeq);
  window.__setBadge && window.__setBadge(true, '💾 저장 폴더 선택...');
  return new Promise(res => {
    _pickWaiters.set(reqid, res);
    window.__wsSend({ type:'pick_save_folder', reqid, title: title || '저장할 폴더 선택',
                      key: key || 'photo_save_dir', suggested: resolveSaveTarget().folder || '' });
  });
}

// 저장 위치·파일명 확정. 반환 {folder, filename, base} / 취소 null.
// 서버 미연결이면 예전처럼 파일명만 물어 다운로드 폴더에 저장한다.
async function askSaveDest(defBase, ext){
  const r = await askSavePath(defBase + ext);
  if (r === undefined){
    const n = prompt('파일명', defBase);
    return n ? { folder:'', filename:n + ext, base:n } : null;
  }
  if (!r || !r.filename) return null;              // 취소
  return { folder:r.folder, filename:r.filename,
           base:r.filename.replace(/\.[^.]+$/, '') };
}

// 대화상자에서 고른 위치에 저장. folder 가 없으면 브라우저 다운로드로 폴백.
function saveBlobTo(dest, blob, onSaved){
  if (dest && dest.folder && window.__wsReady && window.__wsReady()){
    window.__kmzOnSaved = onSaved || null;   // file_saved(ok) 때 호출 / 실패 시 미실행
    const fr = new FileReader();
    fr.onload = () => window.__saveViaPython(dest.folder, dest.filename,
                                             fr.result.split(',')[1], true);
    fr.readAsDataURL(blob);
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = (dest && dest.filename) || 'export';
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 1000);
  if (onSaved) onSaved();
}

// KMZ 저장 시 사진 파일명에 _NNN 번호를 붙일지 여부
function getAddPhotoNum(){ const el=document.getElementById('addPhotoNum'); return !!(el&&el.checked); }

// 수집한 디스크 원본 rename 요청을 서버로 전송
function _sendPhotoRenames(renames){
  if(!renames||!renames.length)return;
  if(!(window.__wsReady&&window.__wsReady())){
    window.__setBadge&&window.__setBadge(true,'⚠️ 서버 미연결 — 원본 파일명 변경 생략');
    return;
  }
  window.__wsSend({type:'rename_photos', items:renames});
}

function _htmKakaoKey(){
  try{
    if (typeof KAKAO_JS_KEY === 'string' && KAKAO_JS_KEY.trim()) return KAKAO_JS_KEY.trim();
    return localStorage.getItem('kakao_js_key')
        || (window.JTY_API_KEYS && window.JTY_API_KEYS.kakao_js_key) || HTM_KAKAO_KEY;
  }catch(e){ return HTM_KAKAO_KEY; }
}

function _hesc(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
                             .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// 내보내기 뷰어 본문 — htm/기본지도.htm 레이아웃(주소검색 · 위경도/주소 · 지도종류 ·
// 거리재기/면적재기)에 데이터 렌더링과 사진 켜기/끄기를 더한 것.
// dxf2convert/Vector_Convert.py 의 TEMPLATE 과 같은 파일을 만든다 — 한쪽만 고치지 말 것.
// __TITLE__ / __KAKAOJSKEY__ / __DATA__ 를 치환해서 쓴다.
// 줄 단위 문자열 배열로 보관 — 템플릿 문자열로 감싸면 안에 있는 정규식(\s 등)이 망가진다.
const BASEMAP_HTM = [
"<!DOCTYPE html>",
"<html>",
"<head>",
"<meta charset=\"utf-8\">",
"<title>__TITLE__</title>",
"<style>",
"  html, body { margin:0; padding:0; width:100%; height:100%; }",
"  #map { position:absolute; top:0; left:0; width:100%; height:100%; }",
"  #panel {",
"    position:absolute; top:10px; left:10px; z-index:1000;",
"    display:flex; align-items:center; gap:8px; flex-wrap:wrap;",
"    background:rgba(255,255,255,0.95); padding:6px 8px; border-radius:6px;",
"    box-shadow:0 2px 6px rgba(0,0,0,0.3);",
"    font-family:'맑은 고딕', 'Malgun Gothic', sans-serif; font-size:13px;",
"    max-width:calc(100vw - 20px);",
"  }",
"  #panel input[type=text] { padding:4px 6px; border:1px solid #bbb; border-radius:4px; }",
"  #searchTxt { width:180px; }",
"  #panel button {",
"    padding:4px 10px; border:1px solid #1e88e5; background:#1e88e5; color:#fff;",
"    border-radius:4px; cursor:pointer; font-size:12px;",
"  }",
"  #panel button:hover { background:#1565c0; }",
"  .info-box { display:flex; align-items:center; gap:6px; padding-left:8px; border-left:1px solid #ddd; }",
"  .info-box label { color:#555; font-weight:bold; white-space:nowrap; }",
"  #latlng { width:190px; }",
"  #addr   { width:230px; }",
"  #copyBtn { border-color:#43a047; background:#43a047; }",
"  #copyBtn:hover { background:#2e7d32; }",
"",
"  /* 지도종류/도구 그룹 */",
"  .tool-group { display:flex; align-items:center; gap:4px; padding-left:8px; border-left:1px solid #ddd; }",
"  .tool-group label { color:#555; font-weight:bold; white-space:nowrap; margin-right:2px; }",
"  .tool-group button { border-color:#607d8b; background:#607d8b; }",
"  .tool-group button:hover { background:#455a64; }",
"  .tool-group button.active { border-color:#e65100; background:#fb8c00; }",
"  #clearBtn { border-color:#c62828; background:#c62828; }",
"  #clearBtn:hover { background:#8e0000; }",
"",
"  /* 측정 결과 오버레이 */",
"  .measure-overlay {",
"    position:relative; background:rgba(255,255,255,0.9); border:1px solid #fb8c00;",
"    border-radius:4px; padding:2px 6px; font-size:12px; font-weight:bold; color:#bf360c;",
"    white-space:nowrap; font-family:'맑은 고딕','Malgun Gothic',sans-serif;",
"    box-shadow:0 1px 3px rgba(0,0,0,0.3);",
"  }",
"  .measure-overlay.total { color:#0d47a1; border-color:#1e88e5; }",
"",
"  /* 하단 안내문 */",
"  #guide {",
"    position:absolute; bottom:14px; left:50%; transform:translateX(-50%); z-index:1000;",
"    background:rgba(0,0,0,0.7); color:#fff; padding:6px 14px; border-radius:16px;",
"    font-family:'맑은 고딕','Malgun Gothic',sans-serif; font-size:13px; display:none;",
"  }",
"</style>",
"</head>",
"",
"<body>",
"<div id=\"panel\">",
"  <input type=\"text\" id=\"searchTxt\" placeholder=\"주소 검색\" onkeydown=\"if(event.keyCode===13){addrSearch();}\">",
"  <button onclick=\"addrSearch()\">검색</button>",
"  <div class=\"info-box\">",
"    <label>위경도</label>",
"    <input type=\"text\" id=\"latlng\" readonly placeholder=\"지도를 클릭하세요\">",
"    <label>주소</label>",
"    <input type=\"text\" id=\"addr\" readonly>",
"    <button id=\"copyBtn\" onclick=\"copyLatLng()\">복사</button>",
"  </div>",
"",
"  <!-- 지도 종류 선택 -->",
"  <div class=\"tool-group\">",
"    <label>지도</label>",
"    <button id=\"btnRoad\" onclick=\"setMapType('ROADMAP')\">일반</button>",
"    <button id=\"btnSky\" onclick=\"setMapType('SKYVIEW')\">스카이뷰</button>",
"    <button id=\"btnHybrid\" onclick=\"setMapType('HYBRID')\" class=\"active\">하이브리드</button>",
"  </div>",
"",
"  <!-- 측정 도구 -->",
"  <div class=\"tool-group\">",
"    <label>측정</label>",
"    <button id=\"btnDist\" onclick=\"toggleMeasure('distance')\">거리재기</button>",
"    <button id=\"btnArea\" onclick=\"toggleMeasure('area')\">면적재기</button>",
"    <button id=\"clearBtn\" onclick=\"clearMeasure()\">지우기</button>",
"  </div>",
"  <!-- 사진 켜기/끄기 -->",
"  <div class=\"tool-group\">",
"    <button id=\"btnPhoto\" class=\"active\" onclick=\"togglePhotos()\">사진 끄기</button>",
"  </div>",
"</div>",
"",
"<div id=\"map\"></div>",
"<div id=\"guide\"></div>",
"",
"<script src=\"https://dapi.kakao.com/v2/maps/sdk.js?appkey=__KAKAOJSKEY__&libraries=services\"><\/script>",
"",
"<script>",
"// 지도 생성",
"var map = new kakao.maps.Map(document.getElementById('map'), {",
"  center: new kakao.maps.LatLng(35.653430667, 127.521775),",
"  level: 4,",
"  minLevel: 0,",
"  mapTypeId: kakao.maps.MapTypeId.HYBRID",
"});",
"",
"// Edge에서 minLevel:0이 무시될 경우 휠 이벤트로 강제 처리",
"document.getElementById('map').addEventListener('wheel', function(e) {",
"  if (e.deltaY < 0 && map && map.getLevel() === 1) {",
"    setTimeout(function() { if (map.getLevel() === 1) map.setLevel(0); }, 50);",
"  }",
"}, { passive: true });",
"",
"// 줌 컨트롤 (지도타입 컨트롤은 직접 만든 버튼으로 대체)",
"map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);",
"",
"// 지도 종류 선택 (하이브리드 포함)",
"function setMapType(type) {",
"  map.setMapTypeId(kakao.maps.MapTypeId[type]);",
"  document.getElementById('btnRoad').classList.toggle('active', type === 'ROADMAP');",
"  document.getElementById('btnSky').classList.toggle('active', type === 'SKYVIEW');",
"  document.getElementById('btnHybrid').classList.toggle('active', type === 'HYBRID');",
"}",
"",
"var geocoder = new kakao.maps.services.Geocoder();",
"var searchMarker = null;",
"",
"// 주소 검색 → 지도 이동 + 마커",
"function addrSearch() {",
"  var keyword = document.getElementById('searchTxt').value.trim();",
"  if (!keyword) return;",
"  geocoder.addressSearch(keyword, function(result, status) {",
"    if (status === kakao.maps.services.Status.OK) {",
"      var pos = new kakao.maps.LatLng(result[0].y, result[0].x);",
"      map.setCenter(pos);",
"      if (searchMarker) searchMarker.setMap(null);",
"      searchMarker = new kakao.maps.Marker({ map: map, position: pos });",
"    } else {",
"      alert('주소를 찾을 수 없습니다.');",
"    }",
"  });",
"}",
"",
"// 열려있는 InfoWindow(사진창·마커창) 목록 — 지도 빈 곳 클릭 시 전부 닫음",
"var openWindows = [];",
"var iwTopZ = 10000100;   // InfoWindow 최상단 z (마커 zIndex 10000010 보다 위)",
"// 창을 열면서 항상 맨 위로 (다른 마커·먼저 열린 창에 가리지 않게)",
"function openWindowTop(iw, marker) {",
"  iw.setZIndex(++iwTopZ);",
"  iw.open(map, marker);",
"  openWindows.push(iw);",
"}",
"var photoPinResets = [];   // 사진창 고정 해제 함수들 (지도 빈 곳 클릭 시 초기화)",
"function closeAllWindows() {",
"  openWindows.forEach(function(iw) { iw.close(); });",
"  openWindows = [];",
"  photoPinResets.forEach(function(fn) { fn(); });",
"}",
"",
"// 지도 클릭 → 사진창 전부 닫기 + 위경도 · 주소 표시 (광역시도 제외)",
"kakao.maps.event.addListener(map, 'click', function(mouseEvent) {",
"  if (measureMode) return;   // 측정 중에는 창닫기·위경도 표시 건너뜀",
"  closeAllWindows();",
"  var latlng = mouseEvent.latLng;",
"  document.getElementById('latlng').value = latlng.getLat() + ', ' + latlng.getLng();",
"  geocoder.coord2Address(latlng.getLng(), latlng.getLat(), function(result, status) {",
"    var addrEl = document.getElementById('addr');",
"    if (status === kakao.maps.services.Status.OK) {",
"      function dropSido(name) {",
"        var parts = name.split(' ');",
"        return parts.length > 1 ? parts.slice(1).join(' ') : name;",
"      }",
"      var legal = result[0].address ? dropSido(result[0].address.address_name) : '';",
"      var road  = result[0].road_address ? ' / ' + dropSido(result[0].road_address.address_name) : '';",
"      addrEl.value = legal + road;",
"    } else {",
"      addrEl.value = '주소 없음';",
"    }",
"  });",
"});",
"",
"// 위경도 클립보드 복사",
"function copyLatLng() {",
"  var text = document.getElementById('latlng').value;",
"  if (!text) { alert('먼저 지도를 클릭하세요.'); return; }",
"  if (navigator.clipboard && navigator.clipboard.writeText) {",
"    navigator.clipboard.writeText(text).then(function(){ alert('클립보드에 복사되었습니다.'); });",
"  } else {",
"    var t = document.getElementById('latlng');",
"    t.removeAttribute('readonly'); t.select();",
"    document.execCommand('copy');",
"    t.setAttribute('readonly', 'readonly');",
"    alert('클립보드에 복사되었습니다.');",
"  }",
"}",
"",
"/* ==================== 사진 켜기/끄기 ==================== */",
"var photoMarkers = [];         // 사진 마커들 (버튼으로 한꺼번에 켜고 끈다)",
"var photoWindows = [];         // 사진창들 (끌 때 열린 것도 닫는다)",
"var photosOn = true;",
"",
"function togglePhotos() {",
"  photosOn = !photosOn;",
"  photoMarkers.forEach(function(m) { m.setMap(photosOn ? map : null); });",
"  if (!photosOn) photoWindows.forEach(function(w) { w.close(); });",
"  var b = document.getElementById('btnPhoto');",
"  b.textContent = photosOn ? '사진 끄기' : '사진 켜기';",
"  b.classList.toggle('active', photosOn);",
"}",
"",
"/* ==================== 거리재기 · 면적재기 ==================== */",
"var measureMode = null;        // null | 'distance' | 'area'",
"var drawing = false;",
"var clickPath = [];",
"var drawLine = null;",
"var moveLine = null;",
"var fillPoly = null;",
"var dots = [];",
"var overlays = [];",
"var totalOverlay = null;",
"var finished = [];             // 완료된 측정들(각각 지도객체 배열) — [지우기] 전까지 유지",
"var guideEl = document.getElementById('guide');",
"",
"function toggleMeasure(mode) {",
"  if (measureMode === mode) { stopMeasure(); return; }",
"  if (drawing) finishMeasure();   // 그리던 측정은 확정해서 남겨둔다",
"  measureMode = mode;",
"  document.getElementById('btnDist').classList.toggle('active', mode === 'distance');",
"  document.getElementById('btnArea').classList.toggle('active', mode === 'area');",
"  map.setCursor('crosshair');",
"  showGuide(mode === 'distance'",
"    ? '클릭하여 지점을 찍으세요 · 더블클릭(또는 우클릭)으로 종료 (계속 이어서 측정 가능)'",
"    : '클릭하여 꼭짓점을 찍으세요 · 더블클릭(또는 우클릭)으로 종료 (계속 이어서 측정 가능)');",
"}",
"",
"function stopMeasure() {",
"  if (drawing) finishMeasure();   // 그리던 측정은 확정해서 남겨둔다",
"  measureMode = null;",
"  drawing = false;",
"  document.getElementById('btnDist').classList.remove('active');",
"  document.getElementById('btnArea').classList.remove('active');",
"  map.setCursor('');",
"  hideGuide();",
"  if (moveLine) { moveLine.setMap(null); moveLine = null; }",
"}",
"",
"function showGuide(txt) { guideEl.textContent = txt; guideEl.style.display = 'block'; }",
"function hideGuide() { guideEl.style.display = 'none'; }",
"",
"// 측정 클릭 처리",
"kakao.maps.event.addListener(map, 'click', function(mouseEvent) {",
"  if (!measureMode) return;",
"  var pos = mouseEvent.latLng;",
"",
"  if (!drawing) {           // 새 측정 시작",
"    resetShapes();",
"    drawing = true;",
"    clickPath = [pos];",
"    drawLine = new kakao.maps.Polyline({",
"      map: map, path: [pos], strokeWeight: 3,",
"      strokeColor: measureMode === 'area' ? '#fb8c00' : '#e53935',",
"      strokeOpacity: 0.9, strokeStyle: 'solid'",
"    });",
"    if (measureMode === 'area') {",
"      fillPoly = new kakao.maps.Polygon({",
"        map: map, path: [pos], strokeWeight: 0,",
"        fillColor: '#fb8c00', fillOpacity: 0.25",
"      });",
"    }",
"    addDot(pos);",
"  } else {                  // 점 추가",
"    clickPath.push(pos);",
"    drawLine.setPath(clickPath.slice());",
"    if (fillPoly) fillPoly.setPath(clickPath.slice());",
"    addDot(pos);",
"    if (measureMode === 'distance') showSegmentDistance(pos);",
"  }",
"  updateTotal(pos);",
"});",
"",
"// 마우스 이동 → 미리보기 선",
"kakao.maps.event.addListener(map, 'mousemove', function(mouseEvent) {",
"  if (!measureMode || !drawing) return;",
"  var pos = mouseEvent.latLng;",
"  var last = clickPath[clickPath.length - 1];",
"  if (!moveLine) {",
"    moveLine = new kakao.maps.Polyline({",
"      map: map, path: [last, pos], strokeWeight: 3,",
"      strokeColor: measureMode === 'area' ? '#fb8c00' : '#e53935',",
"      strokeOpacity: 0.5, strokeStyle: 'dash'",
"    });",
"  } else {",
"    moveLine.setPath([last, pos]);",
"  }",
"});",
"",
"// 더블클릭 / 우클릭 → 측정 종료(확정)",
"kakao.maps.event.addListener(map, 'dblclick', function() { if (measureMode) finishMeasure(); });",
"kakao.maps.event.addListener(map, 'rightclick', function() { if (measureMode) finishMeasure(); });",
"// Esc = 측정 모드 해제. 그리던 중이면 그것만 취소하고(완료된 측정은 그대로 남는다)",
"// 모드를 끈다. 주소 검색칸에 글자를 쓰던 중이면 입력칸에서만 빠져나온다.",
"document.addEventListener('keydown', function(e) {",
"  if (e.key !== 'Escape' && e.keyCode !== 27) return;",
"  var tag = ((e.target && e.target.tagName) || '').toUpperCase();",
"  if (tag === 'INPUT' || tag === 'TEXTAREA') { e.target.blur(); return; }",
"  if (!measureMode && !drawing) return;",
"  resetShapes();       // 그리던 측정 취소",
"  drawing = false;     // stopMeasure 가 finishMeasure 로 확정하지 않도록 먼저 끈다",
"  stopMeasure();",
"  e.preventDefault();",
"});",
"",
"function finishMeasure() {",
"  if (!drawing) return;",
"  drawing = false;",
"  if (moveLine) { moveLine.setMap(null); moveLine = null; }",
"  // 점이 모자라면(거리 1점 / 면적 2점 이하) 결과가 없으므로 그냥 버린다",
"  var enough = (measureMode === 'area') ? clickPath.length >= 3 : clickPath.length >= 2;",
"  if (!enough) { resetShapes(); return; }",
"  updateTotal(clickPath[clickPath.length - 1], true);",
"  archiveCurrent();   // 지도에 그대로 남기고 '현재 측정' 자리만 비움",
"  showGuide('측정 완료 · 다시 클릭하면 측정이 추가됩니다 · [지우기]로 전체 삭제');",
"}",
"",
"// 방금 끝낸 측정을 finished 로 옮긴다(지도에서 지우지 않음).",
"// 이후 새 측정은 빈 상태에서 시작하므로 이전 측정이 그대로 남는다.",
"function archiveCurrent() {",
"  var items = [];",
"  if (drawLine) items.push(drawLine);",
"  if (fillPoly) items.push(fillPoly);",
"  dots.forEach(function(d){ items.push(d); });",
"  overlays.forEach(function(o){ items.push(o); });",
"  if (totalOverlay) items.push(totalOverlay);",
"  if (items.length) finished.push(items);",
"  drawLine = null; fillPoly = null; totalOverlay = null;",
"  dots = []; overlays = []; clickPath = [];",
"}",
"",
"// 점 표시(작은 원)",
"function addDot(pos) {",
"  var dot = new kakao.maps.CustomOverlay({",
"    map: map, position: pos, yAnchor: 0.5, xAnchor: 0.5, zIndex: 2,",
"    content: '<div style=\"width:8px;height:8px;background:#fff;border:2px solid #e53935;border-radius:50%;\"></div>'",
"  });",
"  dots.push(dot);",
"}",
"",
"// 구간 거리 오버레이(거리재기)",
"function showSegmentDistance(pos) {",
"  var seg = new kakao.maps.Polyline({ path: [clickPath[clickPath.length - 2], pos] });",
"  var ov = new kakao.maps.CustomOverlay({",
"    map: map, position: pos, yAnchor: 1.4, zIndex: 3,",
"    content: '<div class=\"measure-overlay\">' + fmtDist(seg.getLength()) + '</div>'",
"  });",
"  overlays.push(ov);",
"}",
"",
"// 총 거리/면적 갱신",
"function updateTotal(pos, finalize) {",
"  if (totalOverlay) { totalOverlay.setMap(null); totalOverlay = null; }",
"  var txt;",
"  if (measureMode === 'distance') {",
"    if (clickPath.length < 2) return;",
"    txt = '총거리 ' + fmtDist(drawLine.getLength());",
"  } else {",
"    if (clickPath.length < 3) return;",
"    txt = '면적 ' + fmtArea(calcArea(clickPath));",
"  }",
"  totalOverlay = new kakao.maps.CustomOverlay({",
"    map: map, position: pos, yAnchor: finalize ? 1.4 : 0, xAnchor: 0, zIndex: 4,",
"    content: '<div class=\"measure-overlay total\">' + txt + '</div>'",
"  });",
"}",
"",
"// 구면 다각형 면적(m^2)",
"function calcArea(path) {",
"  var R = 6378137;",
"  var toRad = function(d){ return d * Math.PI / 180; };",
"  var area = 0, n = path.length;",
"  for (var i = 0; i < n; i++) {",
"    var p1 = path[i], p2 = path[(i + 1) % n];",
"    area += (toRad(p2.getLng()) - toRad(p1.getLng())) *",
"            (2 + Math.sin(toRad(p1.getLat())) + Math.sin(toRad(p2.getLat())));",
"  }",
"  return Math.abs(area * R * R / 2);",
"}",
"",
"// 거리 포맷 (1000m 미만 소수1자리 m, 이상 소수3자리 km)",
"function fmtDist(m) {",
"  return m >= 1000 ? (m / 1000).toFixed(3) + ' km' : m.toFixed(1) + ' m';",
"}",
"// 면적 포맷 (㎡ + 평 / 큰 경우 ㎢)",
"function fmtArea(m2) {",
"  var pyeong = m2 / 3.305785;",
"  var main;",
"  if (m2 >= 1000000) main = (m2 / 1000000).toFixed(3) + ' ㎢';",
"  else main = Math.round(m2).toLocaleString() + ' ㎡';",
"  return main + ' (' + Math.round(pyeong).toLocaleString() + '평)';",
"}",
"",
"// 그리는 중인 측정만 지우기(완료된 측정 finished 는 건드리지 않음)",
"function resetShapes() {",
"  if (drawLine) { drawLine.setMap(null); drawLine = null; }",
"  if (moveLine) { moveLine.setMap(null); moveLine = null; }",
"  if (fillPoly) { fillPoly.setMap(null); fillPoly = null; }",
"  dots.forEach(function(d){ d.setMap(null); }); dots = [];",
"  overlays.forEach(function(o){ o.setMap(null); }); overlays = [];",
"  if (totalOverlay) { totalOverlay.setMap(null); totalOverlay = null; }",
"  clickPath = [];",
"}",
"",
"// 전체 지우기(완료된 측정까지 모두 삭제 + 모드 해제)",
"function clearMeasure() {",
"  drawing = false;   // 지우는 중에 finishMeasure 가 되살아나지 않도록",
"  finished.forEach(function(items){",
"    items.forEach(function(o){ o.setMap(null); });",
"  });",
"  finished = [];",
"  resetShapes();",
"  stopMeasure();",
"}",
"",
"// ══════════════ KMZ 변환 데이터 ══════════════",
"__DATA__",
"// ══════════════ 데이터 렌더링 ══════════════",
"var bounds = new kakao.maps.LatLngBounds();",
"function LL(a) { var l = new kakao.maps.LatLng(a[0], a[1]); bounds.extend(l); return l; }",
"",
"// 선·폴리곤을 원본(도면) 순서 그대로 겹쳐 그림 — 나중 순서가 위에 표시됨",
"var shapes = [];",
"LINES.forEach(function(g) { shapes.push({ t: 'l', g: g }); });",
"POLYS.forEach(function(g) { shapes.push({ t: 'p', g: g }); });",
"shapes.sort(function(a, b) { return (a.g.z || 0) - (b.g.z || 0); });",
"",
"shapes.forEach(function(s) {",
"  var g = s.g;",
"  if (s.t === 'l') {",
"    // 선 (멀티파트 Polyline — 파트 여러 개면 배열의 배열)",
"    var parts = g.p.map(function(pt) { return pt.map(LL); });",
"    new kakao.maps.Polyline({",
"      map: map, path: parts.length === 1 ? parts[0] : parts,",
"      strokeWeight: g.w, strokeColor: g.c, strokeOpacity: g.o, strokeStyle: 'solid',",
"      zIndex: g.z",
"    });",
"  } else {",
"    // 폴리곤 (첫 링=외곽, 나머지=구멍)",
"    var rings = g.p.map(function(pt) { return pt.map(LL); });",
"    new kakao.maps.Polygon({",
"      map: map, path: rings.length === 1 ? rings[0] : rings,",
"      strokeWeight: g.w, strokeColor: g.c, strokeOpacity: g.o, strokeStyle: 'solid',",
"      fillColor: g.fc, fillOpacity: g.fo, zIndex: g.z",
"    });",
"  }",
"});",
"",
"// CAD 문자 라벨 (회전 지원 — CAD 반시계 → CSS 시계라 부호 반전)",
"// t = [lat,lng,내용,rot,color,h,ax,ay,tw]. h(CAD 문자높이 m)>0 이면 줌 연동 크기:",
"//   화면 px = h ÷ (지도 m/px). 축소로 2px 미만이 되면 숨김(겹침 방지), 상한 400px.",
"//   앵커 ax 0=왼쪽 0.5=중앙 1=오른쪽 / ay 0=아래 0.5=중간 1=위 (화면 yAnchor는 1-ay).",
"//   h 없는 옛 KMZ 는 기존처럼 13px 고정 + 중심 정렬.",
"//   tw(MTEXT 기준폭 m)>0 이면 그 폭 안에서 CAD 처럼 자동 줄바꿈 — 폭도 글자와",
"//   같은 비율로 줌에 연동되므로 줄이 접히는 위치는 확대/축소해도 그대로다.",
"var textLabels = [];",
"function mapMetersPerPixel() {",
"  try {",
"    var proj = map.getProjection();",
"    var c = map.getCenter();",
"    var p = proj.containerPointFromCoords(c);",
"    var c2 = proj.coordsFromContainerPoint(new kakao.maps.Point(p.x + 100, p.y));",
"    var R = 6371000,",
"        dLat = (c2.getLat() - c.getLat()) * Math.PI / 180,",
"        dLng = (c2.getLng() - c.getLng()) * Math.PI / 180,",
"        sa = Math.sin(dLat / 2), sb = Math.sin(dLng / 2),",
"        a = sa * sa + Math.cos(c.getLat() * Math.PI / 180) *",
"            Math.cos(c2.getLat() * Math.PI / 180) * sb * sb;",
"    var d = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));",
"    return d > 0 ? d / 100 : 0;",
"  } catch (e) { return 0; }",
"}",
"TEXTS.forEach(function(t) {",
"  var col = t[4] || '#FFEB00';",
"  var h = Number(t[5]) || 0, ax = Number(t[6]) || 0, ay = Number(t[7]) || 0;",
"  var tw = Number(t[8]) || 0;",
"  var xa = h > 0 ? ax : 0.5;",
"  var wrap = h > 0 && tw > 0;   // MTEXT 기준폭이 있으면 CAD 처럼 자동 줄바꿈",
"  // 여러 줄 문자(MTEXT 등)는 줄 그대로 유지 — \\n 을 <br> 로 바꿔 여러 줄로 그린다.",
"  //   줄간격 1.4(=CAD 글자획 변환과 동일), 한 줄짜리 TEXT 는 1(기존 세로 기준점 유지).",
"  var srcLines = String(t[2]).split(/\\r\\n|\\r|\\n/);",
"  var nLine = srcLines.length;",
"  var lh = (nLine > 1 || wrap) ? 1.4 : 1;",
"  // ay=0(베이스라인)은 글상자 맨아래(1.0)가 아니라 마지막 줄 밑선 위치에 앵커 — CAD 기준점과 일치",
"  //   (한 줄: 0.8 — 기존과 동일 / 여러 줄: 전체 높이 대비 같은 비율)",
"  //   단 자동 줄바꿈(MTEXT)은 줄 수가 접히면서 달라지므로 글상자 기준(1-ay)을 그대로 쓴다.",
"  var yaBase = 1 - ((lh - 1) / 2 + 0.2) / (nLine * lh);",
"  var ya = h > 0 ? ((ay < 0.25 && !wrap) ? yaBase : 1 - ay) : 0.5;",
"  var safe = srcLines.map(function(s) {",
"    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');",
"  }).join('<br>');",
"  var el = document.createElement('div');",
"  // 좌표점 고정 + CSS 정렬(dmap 방식): 줌으로 px가 바뀌어도 기준점 불변",
"  el.style.cssText = 'transform:translate(' + (-xa * 100) + '%,' + (-ya * 100) + '%) rotate(' + (-t[3]) + 'deg);' +",
"    'transform-origin:' + (xa * 100) + '% ' + (ya * 100) + '%;' +",
"    (wrap ? 'white-space:normal;word-break:normal;overflow-wrap:break-word;'",
"          : 'white-space:nowrap;') +",
"    'font-size:13px;' +",
"    'text-align:' + (xa >= 0.75 ? 'right' : (xa >= 0.25 ? 'center' : 'left')) + ';' +",
"    'font-weight:bold;line-height:' + lh + ';color:' + col + ';pointer-events:none;' +",
"    'text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000,0 0 2px #000;';",
"  el.innerHTML = safe;",
"  new kakao.maps.CustomOverlay({",
"    map: map, content: el, position: LL(t),",
"    xAnchor: 0, yAnchor: 0, zIndex: 10000006",
"  });",
"  if (h > 0) textLabels.push({ el: el, h: h, tw: wrap ? tw : 0 });",
"});",
"function updateTextLabelSizes() {",
"  if (!textLabels.length) return;",
"  var mpp = mapMetersPerPixel();",
"  if (!(mpp > 0)) return;",
"  textLabels.forEach(function(o) {",
"    var px = o.h * 1.1 / mpp;   // 크기 보정 x1.1 (사용자 체감 확정값 — 여기 숫자만 바꾸면 됨)",
"    if (px < 2) { o.el.style.display = 'none'; return; }",
"    o.el.style.display = '';",
"    var fs = Math.min(px, 400);",
"    o.el.style.fontSize = fs + 'px';",
"    // MTEXT 기준폭도 글자와 같은 배율로 — 글자/폭 비율이 CAD 와 같아 접히는 위치가 유지됨",
"    if (o.tw > 0) o.el.style.width = (o.tw * (fs / px) * 1.1 / mpp) + 'px';",
"  });",
"}",
"kakao.maps.event.addListener(map, 'zoom_changed', updateTextLabelSizes);",
"updateTextLabelSizes();",
"",
"// ── 마커 이미지 (map.html 방식: SVG 원형) ──",
"function mkMarkerImg(color) {",
"  var svg = '<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\">' +",
"    '<circle cx=\"9\" cy=\"9\" r=\"8\" fill=\"' + color + '\" stroke=\"white\" stroke-width=\"2\"/></svg>';",
"  return new kakao.maps.MarkerImage(",
"    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),",
"    new kakao.maps.Size(18, 18), { offset: new kakao.maps.Point(9, 9) });",
"}",
"var MARKER_IMG_RED  = mkMarkerImg('#e74c3c');   // 설명/위치 마커",
"var MARKER_IMG_BLUE = mkMarkerImg('#2471a3');   // 사진 마커",
"",
"function escapeHtml(s) {",
"  return String(s == null ? '' : s).replace(/&/g, '&amp;')",
"    .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;');",
"}",
"// 줄바꿈 유지용 (마커/사진 팝업 이름이 여러 줄이면 그대로 여러 줄로)",
"function escapeHtmlBr(s) {",
"  return escapeHtml(s).replace(/\\r\\n|\\r|\\n/g, '<br>');",
"}",
"",
"// 사진 다운로드 (data URI를 파일로 저장 — 파일명 확장자 자동 보정)",
"function downloadPhoto(src, name) {",
"  var a = document.createElement('a');",
"  a.href = src;",
"  var ext = (src.match(/^data:image\\/([a-zA-Z]+)/) || ['', 'jpg'])[1].replace('jpeg', 'jpg');",
"  var fn = name || 'photo';",
"  if (!/\\.(jpe?g|png|gif|bmp|webp)$/i.test(fn)) fn += '.' + ext;",
"  a.download = fn;",
"  document.body.appendChild(a); a.click(); document.body.removeChild(a);",
"}",
"",
"// 일반 마커 (빨간 원 — 클릭 시 이름 InfoWindow)",
"MARKERS.forEach(function(m) {",
"  var marker = new kakao.maps.Marker({ map: map, position: LL(m), image: MARKER_IMG_RED, zIndex: 10000010 });",
"  if (m[2]) {",
"    var iw = new kakao.maps.InfoWindow({",
"      content: '<div style=\"padding:5px 8px;font-size:13px;\">' + escapeHtmlBr(m[2]) + '</div>',",
"      removable: true",
"    });",
"    kakao.maps.event.addListener(marker, 'click', function() {",
"      openWindowTop(iw, marker);",
"    });",
"  }",
"});",
"",
"// 사진 마커 (파란 원 — 클릭 시 map.html 방식 사진 팝업: 제목바 + 이미지 + 💾다운로드/✖닫기)",
"PHOTOS.forEach(function(ph) {",
"  var marker = new kakao.maps.Marker({ map: map, position: LL(ph), image: MARKER_IMG_BLUE, zIndex: 10000010 });",
"  photoMarkers.push(marker);",
"  var name = ph[2] || '';",
"  var src = ph[3];",
"  var div = document.createElement('div');",
"  div.style.cssText = 'position:relative;width:500px;overflow:hidden;';",
"  div.innerHTML =",
"    '<div style=\"font-weight:bold;font-size:13px;padding:4px 6px 2px;\">' + escapeHtmlBr(name) + '</div>' +",
"    '<div style=\"position:relative;\">' +",
"      '<img src=\"' + src + '\" style=\"display:block;width:100%;max-height:375px;object-fit:contain;\">' +",
"      '<div style=\"position:absolute;top:4px;right:4px;display:flex;gap:3px;\">' +",
"        '<span class=\"dl-btn\" style=\"cursor:pointer;font-size:13px;background:rgba(0,0,0,0.5);color:#fff;border-radius:3px;padding:1px 5px;\" title=\"다운로드\">&#128190;</span>' +",
"        '<span class=\"cl-btn\" style=\"cursor:pointer;font-size:13px;font-weight:bold;background:rgba(0,0,0,0.5);color:#fff;border-radius:3px;padding:1px 5px;\">&#10006;</span>' +",
"      '</div>' +",
"    '</div>';",
"  var iw = new kakao.maps.InfoWindow({ content: div });",
"  photoWindows.push(iw);",
"  var pinned = false;   // 클릭하면 열린 채로 고정 (마우스 이동해도 안 닫힘)",
"  photoPinResets.push(function() { pinned = false; });",
"  div.querySelector('.dl-btn').onclick = function() { downloadPhoto(src, name); };",
"  div.querySelector('.cl-btn').onclick = function() { pinned = false; iw.close(); };",
"  // 마우스를 올리면 사진창이 뜸 (미리보기)",
"  kakao.maps.event.addListener(marker, 'mouseover', function() {",
"    if (!pinned) openWindowTop(iw, marker);",
"  });",
"  // 마우스가 마커에서 벗어나면 (고정된 게 아니면) 자동으로 닫힘",
"  kakao.maps.event.addListener(marker, 'mouseout', function() {",
"    if (!pinned) iw.close();",
"  });",
"  // 클릭하면 열린 채로 고정 (기존과 동일)",
"  kakao.maps.event.addListener(marker, 'click', function() {",
"    pinned = true;",
"    openWindowTop(iw, marker);",
"  });",
"});",
"",
"if (!bounds.isEmpty()) map.setBounds(bounds);",
"<\/script>",
"</body>",
"</html>"
].join('\n');

// 내보낸 htm 을 만든다. 데이터는 var LINES/POLYS/TEXTS/MARKERS/PHOTOS 로 한 줄씩 박아 넣어
// 이 지도에 다시 끌어다 놓거나(_loadExportedHtm) 모바일 지도에서 열어도 그대로 복원된다.
//   · 한 배열 = 한 줄 을 지킬 것 — img/index.html 의 _htmArr 정규식이 개행을 안 넘는다.
//   · replace 는 함수형으로 — 문자열형이면 데이터 안의 $& 같은 치환패턴이 먹힌다.
function buildStandaloneHtm(title, D){
  const J = o => JSON.stringify(o||[]).replace(/</g,'\\u003c');
  const data = ['LINES','POLYS','TEXTS','MARKERS','PHOTOS']
    .map(k => 'var ' + k + '=' + J(D[k]) + ';').join('\n');
  return BASEMAP_HTM.replace('__TITLE__',      () => _hesc(title))
                    .replace('__KAKAOJSKEY__', () => encodeURIComponent(_htmKakaoKey()))
                    .replace('__DATA__',       () => data);
}

// 사이드바 주소값 정리 — '…'(조회중)·'주소 없음' 같은 자리표시자는 빈 값으로
function _htmAddr(a){
  const s=String(a==null?'':a).trim();
  if(!s||s==='…'||s==='주소 없음'||s==='-')return '';
  return s.split(' / ')[0];     // '지번 / 도로명' 형태면 지번만
}

// 내보낼 항목 (전체객체 = 사이드바 목록 그대로 / 선택객체 = 사이드바에서 고른 것)
function _htmItems(selectedOnly){
  const filtered=getFilteredItems();
  if(!selectedOnly)return filtered;
  if(selectedItems.size===0){alert('선택된 항목이 없습니다.');return null;}
  return [...selectedItems].sort((a,b)=>a-b).map(i=>filtered[i]).filter(Boolean);
}

async function exportHTM(selectedOnly){
  const D=await _collectHtmData(selectedOnly); if(!D)return;
  const n=D.LINES.length+D.POLYS.length+D.TEXTS.length+D.MARKERS.length+D.PHOTOS.length;
  if(!n){alert('내보낼 객체가 없습니다.');return;}
  const dest=await askSaveDest(defaultSaveName('지도'),'.htm'); if(!dest)return;
  saveBlobTo(dest,new Blob([buildStandaloneHtm(dest.base,D)],{type:'text/html;charset=utf-8'}));
}

const LAUNCHER_JS = [
"(function(){",
"  var btn=document.getElementById('go'), msg=document.getElementById('msg');",
"  var payload={LINES:LINES,POLYS:POLYS,TEXTS:TEXTS,MARKERS:MARKERS,PHOTOS:PHOTOS};",
"  // PC 에서 열면 PC 지도, 휴대폰에서 열면 모바일 지도",
"  var isMobile=/Android|iPhone|iPad|iPod|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent)",
"    ||(navigator.maxTouchPoints>1&&/Mac/.test(navigator.platform));",
"  var MAPURL=isMobile?MAPURL_MOBILE:MAPURL_PC;",
"  var origin=MAPURL.replace(/^(https?:\\/\\/[^\\/]+).*$/,'$1');",
"  var win=null, timer=null, tries=0, sent=false, shareTried=false;",
"  function say(h){msg.innerHTML=h;}",
"  function reset(label){clearInterval(timer);btn.disabled=false;btn.textContent=label;}",
"",
"  // ── ① 공유 대상(share-target)으로 POST — 휴대폰 기본 경로 ──────────────",
"  // 왜: 안드로이드에 지도 앱이 설치돼 있으면 지도 '주소'를 열 때 브라우저가 아니라 앱이",
"  //     열린다. 앱은 별개 프로그램이라 이 창과 연결(opener)이 끊겨 데이터를 못 받는다.",
"  //     폼 POST 는 앱 인텐트로 바뀌지 않으므로 반드시 브라우저에 남고, 서비스워커가",
"  //     파일을 받아 지도에 그려준다. (연결이 필요 없다)",
"  function sendViaShareTarget(){",
"    if(sent)return; shareTried=true;",
"    try{",
"      var txt='<!DOCTYPE html><meta charset=\"utf-8\"><title>'+document.title+'</title>\\n'",
"        +'<scr'+'ipt>\\n'",
"        +'var LINES='+JSON.stringify(LINES)+';\\n'",
"        +'var POLYS='+JSON.stringify(POLYS)+';\\n'",
"        +'var TEXTS='+JSON.stringify(TEXTS)+';\\n'",
"        +'var MARKERS='+JSON.stringify(MARKERS)+';\\n'",
"        +'var PHOTOS='+JSON.stringify(PHOTOS)+';\\n'",
"        +'</scr'+'ipt>';",
"      var f=new File([txt],(document.title||'지도')+'.htm',{type:'text/html'});",
"      var dt=new DataTransfer(); dt.items.add(f);",
"      var inp=document.createElement('input'); inp.type='file'; inp.name='file'; inp.files=dt.files;",
"      var form=document.createElement('form');",
"      form.method='POST'; form.enctype='multipart/form-data'; form.target='jtymap';",
"      form.action=MAPURL.replace(/\\/?$/,'/')+'share-target';",
"      form.style.display='none'; form.appendChild(inp);",
"      document.body.appendChild(form);",
"      btn.disabled=true; btn.textContent='보내는 중...';",
"      say('브라우저 탭으로 보냈습니다. 새 탭을 확인하세요.');",
"      form.submit();",
"      sent=true; clearInterval(timer); reset('다시 열기');",
"      try{ if(win&&!win.closed) win.focus(); }catch(e){}",
"    }catch(e){ shareTried=false; sent=false; reset('지도 열기');",
"      say('전달 실패: '+e.message+'<br>아래 <b>지도 준비하기</b>를 눌러 보세요.'); }",
"  }",
"",
"  // ── ② 새 탭을 열고 postMessage — PC 기본 경로 / 휴대폰 예비 경로 ────────",
"  function send(target){",
"    if(sent||!target)return;",
"    try{target.postMessage({__jtymap:'data',payload:payload},origin);}",
"    catch(e){say('전송 실패: '+e.message);return;}",
"    sent=true;clearInterval(timer);",
"    say('지도로 보냈습니다. 새 탭을 확인하세요.');",
"  }",
"  window.addEventListener('message',function(ev){",
"    if(ev.origin!==origin||!ev.data)return;",
"    if(ev.data.__jtymap==='ready')send(ev.source||win);",
"    else if(ev.data.__jtymap==='done'){reset('지도 다시 열기');",
"      say('지도에 표시됐습니다. 이 창은 닫아도 됩니다.');",
"      // 지도 탭을 먼저 앞으로 올린 뒤 이 창을 닫는다. 그냥 닫으면 브라우저가 '직전에",
"      // 보던 탭'으로 돌아가, 예전에 열어둔 빈 지도 탭이 앞에 나오는 일이 있다.",
"      try{ if(win&&!win.closed) win.focus(); }catch(e){}",
"      setTimeout(function(){try{window.close();}catch(e){}},500);}",
"  });",
"  function openClassic(){",
"    sent=false;tries=0;shareTried=false;btn.disabled=true;btn.textContent='여는 중...';",
"    say('지도 페이지(https)를 여는 중...');",
"    win=window.open(MAPURL+'#link','jtymap');",
"    if(!win){reset('지도 열기');",
"      say('<b>팝업이 차단됐습니다.</b> 주소창의 차단 아이콘에서 허용한 뒤 다시 누르세요.');return;}",
"    try{win.focus();}catch(e){}",
"    // 지도 탭이 아직 로딩 중일 수 있어 준비될 때까지 0.5초 간격으로 두드린다.",
"    clearInterval(timer);",
"    timer=setInterval(function(){",
"      if(sent){clearInterval(timer);return;}",
"      // 6초를 두드려도 응답이 없으면 앱이 가로챈 것 → 공유 대상으로 우회",
"      if(++tries===12){ sendViaShareTarget(); return; }",
"      if(tries>60){reset('다시 시도');",
"        say('<b>지도 탭이 응답하지 않습니다.</b> 인터넷 연결을 확인하고,'",
"          +' 열린 지도 탭을 새로고침한 뒤 다시 누르세요.');return;}",
"      try{win.postMessage({__jtymap:'ping'},origin);}catch(e){}",
"    },500);",
"  }",
"",
"  btn.onclick=function(){ isMobile ? sendViaShareTarget() : openClassic(); };",
"  // 휴대폰에서 혹시 공유 대상 경로가 안 될 때를 위한 예비 버튼",
"  if(isMobile){",
"    var alt=document.createElement('button');",
"    alt.textContent='지도 준비하기';",
"    alt.style.cssText='margin-top:10px;background:#39414f;font-size:14px;padding:11px;';",
"    alt.onclick=function(){ openClassic(); };",
"    btn.parentNode.insertBefore(alt,msg);",
"    say('브라우저 탭에서 열립니다. 인터넷 연결이 필요합니다.');",
"  }",
"})();"
].join('\n');

// 데이터만 담은 런처 htm 문자열
function buildLauncherHtm(title, D){
  const J = o => JSON.stringify(o||[]).replace(/</g,'\\u003c');
  const c = k => (D[k]||[]).length;
  return [
'<!DOCTYPE html>','<html lang="ko">','<head>','<meta charset="utf-8">',
'<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
'<title>'+_hesc(title)+'</title>',
'<style>',
'html,body{height:100%;margin:0}',
'body{display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:18px;',
'  background:#0f1115;color:#e6e8ee;font-family:"Malgun Gothic","맑은 고딕",system-ui,sans-serif}',
'.card{width:100%;max-width:420px;text-align:center}',
'h1{font-size:19px;margin:0 0 8px;word-break:break-all}',
'.sub{font-size:13px;color:#95a0b4;margin:0 0 22px}',
'button{width:100%;padding:16px;font-size:17px;font-weight:700;border:0;border-radius:12px;',
'  background:#2f6fed;color:#fff;cursor:pointer}',
'button:active{background:#2559c4}',
'button[disabled]{background:#39414f;color:#8b94a4;cursor:default}',
'.msg{margin-top:16px;font-size:13px;line-height:1.7;color:#95a0b4;min-height:46px}',
'.msg b{color:#ffd166}',
'</style>','</head>','<body>',
'<div class="card">',
'<h1>'+_hesc(title)+'</h1>',
'<p class="sub">선 '+c('LINES')+' · 면 '+c('POLYS')+' · 문자 '+c('TEXTS')
  +' · 마커 '+c('MARKERS')+' · 사진 '+c('PHOTOS')+'</p>',
'<button id="go">지도 열기</button>',
'<p class="msg" id="msg">인터넷 지도(https)에서 열려 <b>내위치</b>가 동작합니다. 인터넷 연결이 필요합니다.</p>',
'</div>',
'<script>',
'var LINES='+J(D.LINES)+';',
'var POLYS='+J(D.POLYS)+';',
'var TEXTS='+J(D.TEXTS)+';',
'var MARKERS='+J(D.MARKERS)+';',
'var PHOTOS='+J(D.PHOTOS)+';',
'var MAPURL_MOBILE='+JSON.stringify(GH_MAP_URL)+';',
'var MAPURL_PC='+JSON.stringify(GH_MAP_URL_PC)+';',
LAUNCHER_JS,
'<\/script>','</body>','</html>'
].join('\n');
}

async function exportHTMLink(selectedOnly){
  const D=await _collectHtmData(selectedOnly); if(!D)return;
  const n=D.LINES.length+D.POLYS.length+D.TEXTS.length+D.MARKERS.length+D.PHOTOS.length;
  if(!n){alert('내보낼 객체가 없습니다.');return;}
  const dest=await askSaveDest(defaultSaveName('지도'),'.htm'); if(!dest)return;
  saveBlobTo(dest,new Blob([buildLauncherHtm(dest.base,D)],{type:'text/html;charset=utf-8'}));
}

function _initTabChannel(){
  if(!('BroadcastChannel' in window))return;
  try{ _tabBC=new BroadcastChannel('jtymap-tabs:'+location.pathname); }catch(e){ return; }
  _tabBC.onmessage=ev=>{
    if(!ev.data||ev.data.t!=='takeover'||_tabClaimed)return;
    try{ window.__skipUnloadGuard=true; window.close(); }catch(e){}
  };
}

function _claimSingleTab(){
  _tabClaimed=true;   // 동시에 두 탭이 방송해도 서로 닫아버리지 않게
  if(_tabBC){ try{ _tabBC.postMessage({t:'takeover'}); }catch(e){} }
}

// KMZ 저장 후: 현재 지도에 삽입된 객체 전부를 '임시삽입(_live)' 상태로.
//  → 사이드바에 흐리게 표시되고, 다른 객체(파일)를 선택/로드하면 자동으로 사라진다.
function markAllInsertedLive() {
  let n = 0;
  allItems.forEach(i => { if (!i._live) { i._live = true; n++; } });
  if (n) { try { renderList(); } catch (e) {} }
  return n;
}

// 사진으로 저장 — 폴더만 지정하면 그 폴더에 전부 저장(파일명은 객체 이름 그대로).
// list: [{src,name,lat,lng}]. 서버 미연결이면 예전처럼 다운로드 폴더로 내려받는다.
async function savePhotosToFolder(list){
  if(!list.length){alert('저장할 사진이 없습니다.');return;}
  const folder=await askSaveFolder('사진 '+list.length+'장을 저장할 폴더 선택');
  if(folder==='')return;                        // 취소
  const used=new Set(); let n=0;
  for(const p of list){
    const du=await buildPhotoJpeg(p.src,p.lat,p.lng);
    const base=((p.name||'image').replace(/[\/\\:*?"<>|]/g,'_').replace(/\.(jpe?g|png)$/i,'').trim())||'image';
    let nm=base+'.jpg',c=1;
    while(used.has(nm.toLowerCase())){nm=base+'_'+(c++)+'.jpg';}
    used.add(nm.toLowerCase());
    if(folder===undefined){                     // 서버 미연결 → 브라우저 다운로드
      const a=document.createElement('a');a.href=du;a.download=nm;
      document.body.appendChild(a);a.click();document.body.removeChild(a);
      await new Promise(r=>setTimeout(r,300));
    }else{
      window.__wsSend({type:'save_file',folder,filename:nm,data:du.split(',')[1],
                       overwrite:true,silent:true});
      await new Promise(r=>setTimeout(r,40));
    }
    n++;
  }
  if(folder)window.__setBadge&&window.__setBadge(true,`✅ 사진 ${n}장 저장됨 → ${folder}`);
}

// ══════════════════════════════════════════════════
//  이미지 유틸
// ══════════════════════════════════════════════════
async function convertHeicIfNeeded(file){
  const isHeic=file.type==='image/heic'||file.type==='image/heif'||/\.(heic|heif)$/i.test(file.name);
  if(!isHeic)return file;
  const blob=await heic2any({blob:file,toType:'image/jpeg',quality:0.92});
  return new File([Array.isArray(blob)?blob[0]:blob],file.name.replace(/\.(heic|heif)$/i,'.jpg'),{type:'image/jpeg'});
}

function injectGPS(dataUrl,lat,lng){
  try{
    const toDMS=v=>{const a=Math.abs(v),d=Math.floor(a),m=Math.floor((a-d)*60),s=(a-d-m/60)*3600;return[[d,1],[m,1],[Math.round(s*100),100]];};
    let ex={};try{ex=piexif.load(dataUrl);}catch(e){}
    if(!ex['GPS'])ex['GPS']={};
    ex['GPS'][piexif.GPSIFD.GPSLatitudeRef]=lat>=0?'N':'S';
    ex['GPS'][piexif.GPSIFD.GPSLatitude]=toDMS(lat);
    ex['GPS'][piexif.GPSIFD.GPSLongitudeRef]=lng>=0?'E':'W';
    ex['GPS'][piexif.GPSIFD.GPSLongitude]=toDMS(lng);
    return piexif.insert(piexif.dump(ex),dataUrl);
  }catch(e){return dataUrl;}
}

// 사진 1장 내려받기 (말풍선의 사진저장 버튼)
async function downloadPhotoWithGPS(imgSrc,name,lat,lng){
  const du=await buildPhotoJpeg(imgSrc,lat,lng);
  const a=document.createElement('a');a.href=du;a.download=(name||'image')+'.jpg';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  await new Promise(r=>setTimeout(r,300));
}

function getReorderLine() {
  let el = document.getElementById('reorderLine');
  if (!el) {
    el = document.createElement('div');
    el.id = 'reorderLine';
    el.style.cssText = 'display:none;position:absolute;left:0;right:0;height:3px;background:#e74c3c;pointer-events:none;z-index:20;';
    document.getElementById('photoListWrapper').style.position = 'relative';
    document.getElementById('photoListWrapper').appendChild(el);
  }
  return el;
}

// ══════════════════════════════════════════════════
//  탐색기 연동 WebSocket (사진위치표시.py 와 통신)
// ══════════════════════════════════════════════════
// GitHub Pages(https://)에서는 'PC 연동'을 켠 브라우저에서만 사진위치표시.py 에 붙는다.
//   켜기: 주소 뒤에 ?pc  (예: https://junty75.github.io/map/map?pc)  → 이 브라우저에 기억됨
//   끄기: ?nopc
//   낯선 방문자에게 접속 실패 로그·'로컬 네트워크 접근' 권한 창이 뜨지 않게 하려는 것.
function _pcLinkEnabled(){
  var q=(location.search||'')+'&'+(location.hash||'').replace(/^#/,'');
  try{
    if(/(^|[?&])nopc(=|&|$)/.test(q)){localStorage.removeItem('jty_pc_link');return false;}
    if(/(^|[?&])pc(=1)?(&|$)/.test(q)){localStorage.setItem('jty_pc_link','1');return true;}
    return localStorage.getItem('jty_pc_link')==='1';
  }catch(e){return /(^|[?&])pc(=1)?(&|$)/.test(q);}
}

// ── 📁 경로폴더 — 엑셀 경로 수정 때 찾을 폴더 목록 관리 (창은 사진위치표시.py 가 띄운다) ──
function initRelinkDirsBtn(){
  const b = document.getElementById('relinkDirsBtn');
  if (!b) return;
  b.onclick = () => {
    if (!(window.__wsReady && window.__wsReady())) {
      alert('탐색기 연동 서버(사진위치표시.py)가 실행 중이어야 합니다.'); return;
    }
    window.__wsSend({ type: 'relink_dirs_dialog' });
    window.__setBadge && window.__setBadge(true, '📁 경로폴더 창이 열렸습니다 (작업표시줄 확인)');
  };
}
window.__onRelinkDirs = d => {
  const n = (d.dirs || []).length;
  window.__setBadge && window.__setBadge(true, d.saved ? ('📁 경로폴더 ' + n + '곳 저장') : '📁 경로폴더 — 바꾸지 않음');
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initRelinkDirsBtn);
else initRelinkDirsBtn();
