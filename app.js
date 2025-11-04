document.addEventListener("DOMContentLoaded", () => {
  const flightInput = document.getElementById("flight-input");
  const dateInput = document.getElementById("date-input");
  const searchBtn = document.getElementById("search-btn");
  const scanBtn = document.getElementById("scan-btn");
  const flightInfo = document.getElementById("flight-info");
  const baggageInfo = document.getElementById("baggage-info");
  const resultSection = document.getElementById("result-section");
  const loading = document.getElementById("loading");
  const messageBox = document.getElementById("message");

  const scannerOverlay = document.getElementById("scanner-overlay");
  const scannerClose = document.getElementById("scanner-close");
  const readerId = "reader";

  // 页面初始状态
  loading.style.display = "none";
  messageBox.style.display = "none";
  resultSection.style.display = "none";

  // 自动填今天日期
  const todayStr = new Date().toISOString().slice(0,10);
  dateInput.value = todayStr;

  // 实时更新时间
  setInterval(() => {
    const now = new Date();
    document.getElementById("current-time").innerText = now.toLocaleString("zh-CN");
  }, 1000);

  function showMessage(text, timeout=3000) {
    messageBox.style.display = "block";
    messageBox.innerText = text;
    if (timeout>0) setTimeout(()=> messageBox.style.display = "none", timeout);
  }

  // 将时间字符串转为Date
  function scheduledToDate(dateStr, timeStr) {
    const [h, m] = (timeStr || "00:00").split(":").map(v=>parseInt(v,10));
    const parts = dateStr.split("-");
    return new Date(parts[0], parts[1]-1, parts[2], h, m);
  }

  // 查询函数
  async function queryFlightByNumberAndDate(inputNumber, dateStr) {
    loading.style.display = "block";
    resultSection.style.display = "none";

    try {
      const res = await fetch("./database.json?_t=" + Date.now());
      if (!res.ok) throw new Error("加载失败");
      const json = await res.json();

      const normInput = (inputNumber||"").trim().toUpperCase();
      const found = json.data.find(item => {
        const iata = (item.flight?.iata || "").toUpperCase();
        const iataShort = iata.replace(/^[A-Z]+/, "");
        const dateMatch = (item.flight?.date) === dateStr;
        const numberMatch = (iata === normInput) || (iataShort === normInput);
        return dateMatch && numberMatch;
      });

      loading.style.display = "none";

      if (!found) {
        showMessage("未找到该日期的航班。", 4000);
        return;
      }

      const now = new Date();
      const recDate = found.flight.date;
      const schedTime = found.flight.scheduled;
      const scheduledDateTime = scheduledToDate(recDate, schedTime);
      const todayYMD = now.toISOString().slice(0,10);

      let dynamicStatus;
      if (recDate < todayYMD || (recDate === todayYMD && scheduledDateTime <= now)) {
        dynamicStatus = "到达";
      } else {
        dynamicStatus = "计划中";
      }

      resultSection.style.display = "block";
      flightInfo.innerHTML = `
        <p><strong>航班号：</strong>${found.flight.iata}</p>
        <p><strong>日期：</strong>${found.flight.date}</p>
        <p><strong>出发地：</strong>${found.flight.departure}</p>
        <p><strong>目的地：</strong>${found.flight.arrival}</p>
        <p><strong>计划起飞时间：</strong>${found.flight.scheduled}</p>
        <p><strong>计划到达时间：</strong>${found.flight.arrival_scheduled}</p>
        <p><strong>航班状态：</strong>${dynamicStatus}</p>
      `;

      baggageInfo.innerHTML = `
        <p><strong>行李状态：</strong>${found.baggage}</p>
        <p><strong>行李转盘：</strong>${found.baggage_claim}</p>
      `;
    } catch (err) {
      console.error(err);
      loading.style.display = "none";
      showMessage("❌ 数据加载失败，请检查 database.json 文件是否在同目录下", 6000);
    }
  }

  // 按钮事件
  searchBtn.addEventListener("click", () => {
    const num = flightInput.value.trim();
    const date = dateInput.value;
    if (!num || !date) return alert("请输入航班号和日期");
    queryFlightByNumberAndDate(num, date);
  });

  // 回车查询
  flightInput.addEventListener("keypress", e => {
    if (e.key === "Enter") searchBtn.click();
  });

  // ------------------ 扫码功能 ------------------
  let html5QrCode = null;
let scanning = false;

function startScanner() {
  // 检查库是否加载
  if (typeof Html5Qrcode === 'undefined') {
    showMessage("⚠️ 二维码扫描库加载失败，请刷新页面", 4000);
    return;
  }

  if (scanning) return;

  // 检查浏览器是否支持摄像头
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showMessage("❌ 您的浏览器不支持摄像头功能，请使用 Chrome、Edge 或 Safari", 5000);
    return;
  }

  scannerOverlay.style.display = "flex";
  const qrboxSize = Math.min(320, Math.floor(window.innerWidth * 0.8));
  html5QrCode = new Html5Qrcode(readerId);

  html5QrCode.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: { width: qrboxSize, height: qrboxSize } },
    (decodedText) => {
      flightInput.value = decodedText.trim();
      showMessage("✅ 二维码识别成功：" + decodedText, 2500);
      stopScanner();
    }
  ).then(() => {
    scanning = true;
  }).catch(err => {
    console.error(err);
    let errorMsg = "❌ 无法启动摄像头";
    
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      errorMsg = "❌ 请允许浏览器访问摄像头权限";
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      errorMsg = "❌ 未检测到摄像头设备";
    } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      errorMsg = "❌ 摄像头被其他应用占用";
    }
    
    showMessage(errorMsg, 5000);
    // 清理状态
    html5QrCode = null;
    scanning = false;
    scannerOverlay.style.display = "none";
  });
}

function stopScanner() {
  if (html5QrCode && scanning) {
    html5QrCode.stop().then(() => {
      html5QrCode.clear();
      html5QrCode = null;
      scanning = false;
      scannerOverlay.style.display = "none";
    }).catch(err => {
      console.error("停止扫描时出错:", err);
      // 强制重置状态
      html5QrCode = null;
      scanning = false;
      scannerOverlay.style.display = "none";
    });
  } else {
    // 如果扫描器没有运行，直接关闭弹层
    scannerOverlay.style.display = "none";
    scanning = false;
    html5QrCode = null;
  }
}

scanBtn.addEventListener("click", startScanner);
scannerClose.addEventListener("click", stopScanner);
});
