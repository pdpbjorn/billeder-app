/* SECTION Global variables*/
	//var theDataset; //Global variable storing the data loaded from geojson
	//var theAreas; //a set of geograpical areas (countries) for cookie cutting - loaded from JSON file
	//var theTrips; //a list with descriptions of the trips available as KML - loaded from JSON file
/* Navigation:
Assure that pages are stacked and that destroying page displays underlaying
Liste:
drop->thumbs->img->map
  Xclick on imgpage -> destroy img, ->thumbs
  geoclick on imgpage -> destroy img - > mappage
  thumbclick on map: destroy map, reload img
  listclick on map: destroy map, destroy img, update thumbpage with new dataset

  always (also on geclick) remove .imagepage - if i need it again i can
  window.location.href = "#page-" + imgPage(currentImageIndex) 
Kort :
drop->map->img
  geoclick on img: destroy img, pan map
  listclick on map: set List, destroy mappage, call thumbpage with new dataset
  xclick on imgpage -> map


  TRIPMARKERS
    UseOnMap(KML)
      doFolder
        doPlacemark
          *createMarker


  GEOCLICK on imgPage
    ShowOnMap (features)
      *createMarker
        PhotoInfoWindow
          t.onclick
            map.remove()
            navigate? -> imgPage        

  Turbilleder          
    addMapControl:case:trippics
      showTripPhotosOnMap
        *createMarker
          PhotoInfoWindow
          t.onclick = function () {
            $(".mappage").remove();
            imgPage(featureIndex);


*/

	let map; //global variable storing the Google Maps map
	const MAP_ID = "c4befeb907ef4d6a4789e14c";
	var slideShowOn; //boolean variable which know if the image slideshow is running
	var thumbPageScroll; //variable storing the vertical scroll position of the thumbnail page before some other page was loaded - useful for restoring scroll position
	var objX; //Global object storing the JSON version of the trip loaded from the KML file	
	var currentImageIndex; //Global variable storing the Global index number of the image currently displayed
	var mapOverlayId = 0; //Globally incrementing counter enumerating all features items liaded to the map
	//var folderDepth = 1; //Globally incrementing counter enumerating the relative nestedness of the folders in the JSTree structure
	var addedOverlays = []; //Array storing all items loaded onto the map
	var addedMarkers = []; //array of markers added to the map for geotagging
	var textFile = null;
	var tripPixDates = {}; //start and enddates for the selected trip
	var pendingIndexLoads = 3;//countdown for the index loads
	var tidIndex = null;
	var stedIndex = null;
	var anvIndex = null;
	var currentDataset = null;

let photoCluster = null;

// --- Cancelable / yielding thumbnail rendering ---
let buildTilesToken = 0;
let currentDatasetXHR = null;
let lastViewMode = "thumbs";


function cancelBuildTiles() {
  buildTilesToken++;

  if (thumbObserver) {
    thumbObserver.disconnect();
    thumbObserver = null;
  }

  resetThumbLoader();

  $("#tilebox img").each(function () {
    this.onload = null;
    this.onerror = null;
    this.src = "";
  });

  $("#tilebox").stop(true, true).empty();
}



// --- True lazy thumbnail loading (prevents network starvation) ---
const THUMB_PLACEHOLDER =
  "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=";

let thumbObserver = null;

// Throttle: how many thumbnails may download concurrently
const MAX_THUMB_INFLIGHT = 6;
let thumbQueue = [];
let thumbInFlight = 0;

function resetThumbLoader() {
  thumbQueue = [];
  thumbInFlight = 0;
}

function pumpThumbQueue(myToken) {
  if (myToken !== buildTilesToken) return;

  while (thumbInFlight < MAX_THUMB_INFLIGHT && thumbQueue.length) {
    const img = thumbQueue.shift();
    if (!img) continue;
    if (myToken !== buildTilesToken) return;

    const real = img.dataset.src;
    if (!real) continue;

    thumbInFlight++;

    const done = () => {
      img.onload = null;
      img.onerror = null;
      thumbInFlight--;
      pumpThumbQueue(myToken);
    };

    img.onload = done;
    img.onerror = done;

    // Start the network request only here (throttled)
    if (img.src !== real) img.src = real;
  }
}

function ensureThumbObserver(myToken) {
  if (thumbObserver) return;

  thumbObserver = new IntersectionObserver(
    (entries) => {
      if (myToken !== buildTilesToken) return;

      entries.forEach((e) => {
        if (!e.isIntersecting) return;

        const img = e.target;
        thumbObserver.unobserve(img);

        // Enqueue instead of downloading immediately
        thumbQueue.push(img);
      });

      pumpThumbQueue(myToken);
    },
    {
      root: document.getElementById("tilebox") || null,
      // reduce burstiness (600px tends to pull in lots of tiles very quickly)
      rootMargin: "200px",
      threshold: 0.01,
    }
  );
}



// --- Geotagger placement: map click mode (replaces DrawingManager) ---
let geotagClickListener = null;

function hasChosenImages() {
  return document.getElementsByClassName("chosen").length > 0;
}

function enableGeotagClickPlacement() {
  if (!map || geotagClickListener) return;

  geotagClickListener = map.addListener("click", (e) => {
    // Only place when user has selected images
    if (!hasChosenImages()) return;

    const pos = e.latLng.toJSON(); // {lat, lng}

    // Place ALL currently chosen images at clicked position
    $(".chosen").each(function (_i, chosenImage) {
      imageToMap(chosenImage, pos, true);
    });

    makeTextFile(addedMarkers);

    // If everything got placed, disable click mode again
    syncGeotagClickPlacementMode();
  });
}

function disableGeotagClickPlacement() {
  if (geotagClickListener) {
    google.maps.event.removeListener(geotagClickListener);
    geotagClickListener = null;
  }
}

function syncGeotagClickPlacementMode() {
  if (hasChosenImages()) enableGeotagClickPlacement();
  else disableGeotagClickPlacement();
}


let markerReadyResolve;
const markerReady = new Promise((res) => (markerReadyResolve = res));


window.initMap = async function initMap() {
  gMarkerLib = await google.maps.importLibrary("marker");
  markerReadyResolve();
};


// --- Modern marker support (AdvancedMarkerElement when available) ---
let gMarkerLib = null;

// Turn remote KML icon URLs into local file paths.
// Example: https://example.com/icons/foo.png  ->  icons/foo.png
function resolveKmlIconUrl(url) {
  if (!url) return url;
  // already local/relative
  if (!/^https?:\/\//i.test(url)) return url;

  const clean = url.split("?")[0];
  const filename = clean.substring(clean.lastIndexOf("/") + 1);
  return `icons/KML/${filename}`;

}
function markerLatLng(m) {
  const p = m.position;
  if (!p) return null;
  if (typeof p.lat === "function") return { lat: p.lat(), lng: p.lng() };
  return { lat: p.lat, lng: p.lng };
}
// Create a marker using AdvancedMarkerElement,


let _amCssInjected = false;
function ensureAdvancedMarkerCss() {
  if (_amCssInjected) return;
  _amCssInjected = true;
  const style = document.createElement("style");
  style.id = "am-marker-css";
  style.textContent = `.am-wrap{position:relative;width:0;height:0;}
/* Stable anchoring: separate anchor transform from animations */
.am-anchor{
  position:absolute;
  left:0;
  top:0;
  transform:translate(-50%,-100%);
  transform-origin:50% 100%;
  pointer-events:auto;
  transition:transform .16s ease;
}
.am-anim{
  position:relative;
  --am-size:32px;
  width:var(--am-size);
  height:var(--am-size);
  filter:none !important;
  box-shadow:none !important;
  -webkit-filter:none !important;
}
.am-marker-img{
  width:100%;
  height:100%;
  display:block;
  object-fit:contain;
  filter:none !important;
  box-shadow:none !important;
  -webkit-filter:none !important;
  pointer-events:auto;
}
.am-marker-dot{
  width:12px;
  height:12px;
  border-radius:50%;
  background:#d00;
}

/* For photo markers, place the dot center exactly on the map coordinate */
.am-anim.photo .am-marker-dot{
  position:absolute;
  left:50%;
  bottom:-6px;
  transform:translateX(-50%);
}

/* Collapsed multi-marker badge, centered on the actual dot */
.am-anim.photo.photo-multi::after{
  content:"";
  position:absolute;
  left:50%;
  bottom:-17px;
  width:34px;
  height:34px;
  transform:translateX(-50%);
  border:3px solid #d40000;
  border-radius:50%;
  box-shadow:0 0 0 2px #fff, 0 0 8px rgba(0,0,0,.45);
  pointer-events:none;
}

.am-anim.photo.photo-multi::before{
  content:"+";
  position:absolute;
  left:calc(50% + 10px);
  bottom:8px;
  width:18px;
  height:18px;
  border-radius:50%;
  background:#d40000;
  color:#fff;
  font-size:13px;
  font-weight:bold;
  display:flex;
  align-items:center;
  justify-content:center;
  box-shadow:0 0 4px rgba(0,0,0,.4);
  z-index:2;
  pointer-events:none;
}
.am-drop{animation:amDrop .6s ease-out}
.am-bounce{animation:amBounce .35s ease-in-out infinite alternate}
@keyframes amDrop{
  0%{transform:translateY(-36px)}
  100%{transform:translateY(0)}
}
@keyframes amBounce{
  from{transform:translateY(0)}
  to{transform:translateY(-8px)}
}`;
  document.head.appendChild(style);
}

function createMarker({
  map,
  position,
  title = "",
  icon = null,
  draggable = false,
  cssClass = "",
  animateDrop = false
}) {
  const AdvancedMarkerElement = gMarkerLib?.AdvancedMarkerElement;
  if (!AdvancedMarkerElement) {
    throw new Error("Advanced marker library not loaded. Check index.htm libraries and initMap().");
  }

  ensureAdvancedMarkerCss();

  // Outer is positioned by Maps (Maps sets transform on it)
  const outer = document.createElement("div");
  outer.className = "am-wrap";

  // Anchor holds our constant translate(-50%,-100%) and never animates
  const anchor = document.createElement("div");
  anchor.className = "am-anchor";

  // Anim element is where we run drop/bounce animations (transform: translateY)
  const anim = document.createElement("div");
  anim.className = `am-anim ${cssClass}`.trim();
  anim.style.filter = "none";

  let imgEl = null;
  const iconUrl = (typeof icon === "string") ? icon : (icon && icon.url ? icon.url : null);

  if (iconUrl) {
    const img = document.createElement("img");
    img.src = iconUrl;
    img.alt = title;
    img.className = "am-marker-img";
    img.style.filter = "none";
    img.style.boxShadow = "none";
    img.style.display = "block";
    anim.appendChild(img);
    imgEl = img;
  } else {
    const dot = document.createElement("div");
    dot.className = "am-marker-dot";
    anim.appendChild(dot);
  }

  if (animateDrop) anim.classList.add("am-drop");

  anchor.appendChild(anim);
  outer.appendChild(anchor);

  const m = new AdvancedMarkerElement({
    map,
    position,
    title,
    content: outer
  });

  // If the icon image loads after the marker is placed, force a lightweight refresh
  // (helps avoid brief incorrect offsets on some browsers)
  if (imgEl && !imgEl.complete) {
    imgEl.addEventListener("load", () => {
      const mm = m.map;
      m.map = null;
      m.map = mm;
    }, { once: true });
  }

  m.gmpClickable = true;
  m.gmpDraggable = !!draggable;

  if (animateDrop) {
    anim.addEventListener("animationend", () => anim.classList.remove("am-drop"), { once: true });
  }

  // expose for bounce helper
  m.__amAnim = anim;

  return m;
}

// CSS-bounce for AdvancedMarkerElement
function setMarkerBounce(marker, on) {
  if (!marker) return;

  const anim = marker.__amAnim ||
    (marker.content?.querySelector ? marker.content.querySelector(".am-anim") : null);

  if (!anim) return;
  anim.classList.toggle("am-bounce", !!on);
}

/*Ø SECTION General behavior*/	

//sending all keystrokes to the doKey function
	document.addEventListener('keydown', doKey);

//Handling keystrokes
	function doKey(e) {
		//  console.log(e);  
			if ($(".imagepage").length > 0) //If the image page is open
			{   
				switch(e.key) {
					case 'Escape': //if 'escape' then close image page
				
            $(".imagepage").remove();

            if (lastViewMode === "map") {
              window.location.href = "#mappage";
            } else {
              window.location.href = "#initial";
              setTimeout(function(){
                window.scrollBy(0, thumbPageScroll);
              }, 200);
            }

            break;
					case 'ArrowRight'://if 'right arrow' browse to higher image index
						bladr(true)
					break;
					case 'ArrowLeft': //if 'left arrow' browse to lower image index
						bladr(false)
					break;
					default:
				}
                return;
			}
			if ($(".mappage").length > 0) //if the Map page is open
			{   
				switch(e.key) {
					case 'Escape': //if 'escape then close map and go to thumbpage
						$(".mappage").remove();
            exitMapMode();
            hideMainToolbar();
						window.location.href = "#initial";
					break;
				}
			}
		}
//Handlingn swipes		
		let touchstartX = 0
		let touchendX = 0
			
		function checkDirection() {
		  if (touchendX < touchstartX && (touchendX - touchstartX) < -100) bladr(false)
		  if (touchendX > touchstartX && (touchendX - touchstartX) > 100) bladr(true)
		}
		
		document.addEventListener('touchstart', e => {
		  touchstartX = e.changedTouches[0].screenX
		})
		
		document.addEventListener('touchend', e => {
		  touchendX = e.changedTouches[0].screenX
		  checkDirection()
		})
	
 
//Listening for handheld screen orientation change, trying to rotate and resize displayed image
	$(window).on('orientationchange', function() {
		// After orientationchange, add a one-time resize event
		$(window).on('resize', function() {
			const WWW =  $( window ).width() + "px";
			const HHH =  $( window ).height() + "px";
			//$( "#orientation" ).text( " window.width= " + WWW + " window.height= " + HHH );
			$("#image0").css({"max-width":WWW ,"max-height": HHH})//"max-height": $( window ).height()  + "px"}) 
	//This device is in " + event.orientation + " mode,
		});
	});




function indexLoadedOne(){
  pendingIndexLoads--;
  if (pendingIndexLoads <= 0) {
    $('#spinner').remove();
    $('select').selectmenu('enable');

    // keep your mobile click toggling for nested lists
    const li = document.querySelectorAll('li.dropdown a');
    li.forEach((each)=>{
      if (each.nextElementSibling !== null) {
        each.addEventListener('click', e=>{
          if (window.innerWidth < 1068) {
            e.target.parentElement.classList.toggle("active");
          }
        })
      }
    });
  }
}



function setCurrentDataset(json){
  // Ensure local per-selection indexes for image browsing / preload logic
  if (json && json.features) {
    json.features.forEach((f, i) => {
      if (!f.properties) f.properties = {};
      f.properties.index = i;
    });
  }
  currentDataset = json;
}






const appNavData = {
  tid: null,
  sted: null,
  anvendelse: null
};

const navState = {
  currentRoot: null,
  stack: [],
  pendingSelection: null,
  activeSelection: null,
  initialTileboxMarkup: null
};

function initAdaptiveNav() {
  if (navState.initialized) return;
  navState.initialized = true;

  navState.initialTileboxMarkup = $("#tilebox").html();

  $(document)
    .off("click", ".toolbar-btn[data-nav-root]")
    .on("click", ".toolbar-btn[data-nav-root]", function () {
      openNavRoot(this.dataset.navRoot);
    })
    .off("click", "#navDrawerClose, #navDrawerBackdrop")
    .on("click", "#navDrawerClose, #navDrawerBackdrop", closeNavDrawer)
    .off("click", "#navDrawerBack")
    .on("click", "#navDrawerBack", stepBackNav)
    .off("click", "#navClearSelection")
    .on("click", "#navClearSelection", resetCurrentSelection)
    .off("change", "#Choice-of-list, #Choice-of-map")
    .on("change", "#Choice-of-list, #Choice-of-map", syncViewToggleState)
    .off("keydown", "#navDrawer .drawer-option, #navDrawer .drawer-action, #navDrawer .drawer-footer-btn")
    .on("keydown", "#navDrawer .drawer-option, #navDrawer .drawer-action, #navDrawer .drawer-footer-btn", handleDrawerKeyNav);

  syncViewToggleState();
  updateSelectionLabel();
  updateNavAvailability();
}

function syncViewToggleState() {
  $(".view-toggle-option").removeClass("active");
  if (document.getElementById("Choice-of-list")?.checked) {
    $("label[for='Choice-of-list']").addClass("active");
  }
  if (document.getElementById("Choice-of-map")?.checked) {
    $("label[for='Choice-of-map']").addClass("active");
  }
}

function updateNavAvailability() {
  ["tid", "sted", "anvendelse"].forEach(root => {
    const hasData = !!appNavData[root] && ((root === "sted" && appNavData[root].length) || (root === "tid" && appNavData[root].decades?.length) || (root === "anvendelse" && appNavData[root].groups?.length));
    $(".toolbar-btn[data-nav-root='" + root + "']").prop("disabled", !hasData).toggleClass("is-disabled", !hasData);
  });
}

function openNavRoot(root) {
  if (!appNavData[root]) return;
  if (navState.currentRoot === root && $("#navDrawer").hasClass("is-open")) {
    closeNavDrawer();
    return;
  }
  navState.currentRoot = root;
  navState.pendingSelection = null;
  navState.savedStacks = navState.savedStacks || { tid: [], sted: [], anvendelse: [] };
  const saved = navState.savedStacks[root] || [];
  navState.stack = saved.map(item => ({ label: item.label, node: item.node }));
  $(".toolbar-btn[data-nav-root]").removeClass("is-active");
  $(".toolbar-btn[data-nav-root='" + root + "']").addClass("is-active");
  renderNavDrawer();
  openNavDrawer();
  if (document.body.classList.contains("toolbar-floating")) {
  $(".app-nav").addClass("app-nav-hidden");
  updateFloatingFilterButtonText();
}
}

function openNavDrawer() {
  $("#navDrawer").addClass("is-open").attr("aria-hidden", "false");
  $("#navDrawerBackdrop").prop("hidden", false);
  window.setTimeout(() => {
    $("#navDrawer .drawer-option:visible, #navDrawer .drawer-action:visible, #navDrawer .drawer-footer-btn:visible").first().trigger("focus");
  }, 30);
}

function closeNavDrawer() {

   const drawer = document.getElementById("navDrawer");

  if (drawer && drawer.contains(document.activeElement)) {
    document.activeElement.blur();
  }
  $("#navDrawer").removeClass("is-open").attr("aria-hidden", "true");
  $("#navDrawerBackdrop").prop("hidden", true);
}

function stepBackNav() {
  if (navState.stack.length > 0) {
    navState.stack.pop();
    navState.pendingSelection = null;
    renderNavDrawer();
  } else {
    closeNavDrawer();
  }
}

function getDrawerTitle() {
  if (navState.currentRoot === "tid") return "Vælg tid";
  if (navState.currentRoot === "sted") return "Vælg sted";
  if (navState.currentRoot === "anvendelse") return "Vælg anvendelse";
  return "Vælg filter";
}

function ensureFloatingFilterButton() {
  let btn = document.getElementById("floatingFilterButton");

  if (!btn) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "floatingFilterButton";
    btn.className = "floating-filter-btn";
    btn.addEventListener("click", toggleMainToolbar);
    document.body.appendChild(btn);
  }

  updateFloatingFilterButtonText();
  return btn;
}

function updateFloatingFilterButtonText() {
  const btn = document.getElementById("floatingFilterButton");
  if (!btn) return;

  btn.textContent = $(".app-nav").hasClass("app-nav-hidden")
    ? "☰ Filtre"
    : "× Filtre";
}

function showFloatingFilterButton() {
  const btn = ensureFloatingFilterButton();
  btn.hidden = false;
  updateFloatingFilterButtonText();
}

function hideFloatingFilterButton() {
  const btn = document.getElementById("floatingFilterButton");
  if (btn) btn.hidden = true;
}

function hideMainToolbar() {
  $(".app-nav").addClass("app-nav-hidden");

  document.body.classList.remove("toolbar-floating");

  showFloatingFilterButton();
  updateFloatingFilterButtonText();
}

function showMainToolbar() {
  $(".app-nav")
    .removeClass("app-nav-hidden");

  document.body.classList.add("toolbar-floating");

  showFloatingFilterButton();
  updateFloatingFilterButtonText();
}

function toggleMainToolbar() {
  if ($(".app-nav").hasClass("app-nav-hidden")) {
    showMainToolbar();
  } else {
    hideMainToolbar();
  }
}

function enterMapMode() {
  document.body.classList.add("map-mode");
  hideMainToolbar();
}

function exitMapMode() {
  document.body.classList.remove("map-mode");
}



function getBreadcrumbText() {
  if (!navState.stack.length) return "";
  return navState.stack.map(item => item.label).join(" › ");
}

function formatTripDate(dateString) {
  if (!dateString) return "";
  const parts = String(dateString).split("-");
  if (parts.length !== 3) return dateString;
  return parts[2] + "." + parts[1] + "." + parts[0];
}

function formatTripRange(trip) {
  const start = formatTripDate(trip.startDate);
  const end = formatTripDate(trip.endDate);
  if (start && end && start !== end) return start + " – " + end;
  return start || end || "";
}

function buildTripMeta(trip) {
  const pieces = [];

  const range = formatTripRange(trip);
  if (trip.comment) pieces.push(trip.comment);
  if (range) pieces.push(range);
  if (typeof trip.count === "number" && trip.count > 0) {
    pieces.push(trip.count + " billeder");
  }

  return pieces.join(" · ");
}

function getDrawerHint() {
  if (navState.currentRoot === "tid") {
    if (isDesktopTimeChooser()) return "Vælg årti, år og måned.";
    if (navState.stack.length === 0) return "Vælg et årti.";
    if (navState.stack.length === 1) return "Vælg et år.";
    return "Vælg en måned.";
  }
  if (navState.currentRoot === "sted") return "";
  if (navState.currentRoot === "anvendelse") {
    if (navState.stack.length === 0) return "Vælg gruppe.";
    return "";
  }
  return "";
}

function isDesktopTimeChooser() {
  return (
    navState.currentRoot === "tid" &&
    window.innerWidth >= 1100 &&
    !window.matchMedia("(pointer: coarse)").matches
  );
}

function getCurrentLayoutClass() {
  if (isDesktopTimeChooser()) return "layout-time-columns";
  if (window.innerWidth < 900) return "layout-list";
  if (navState.currentRoot === "sted") return "layout-grid";
  if (navState.currentRoot === "tid" && navState.stack.length < 2) return "layout-grid";
  return "layout-list";
}

function selectAndApply(selection) {
  navState.pendingSelection = selection;
  navState.activeSelection = selection;
  updateSelectionLabel();
  closeNavDrawer();
  selection.action();

  hideMainToolbar();
}

function captureTimeColumnScrolls(){
  return $("#navDrawerBody .time-column-list").map(function(){ return this.scrollTop; }).get();
}
function advanceTidNav(nextStack) {
  navState.stack = nextStack;
  navState.pendingSelection = null;

  if (isDesktopTimeChooser()) {
    updateTimeColumns();
    return;
  }

  renderNavDrawer();

  setTimeout(() => {
    const drawer = document.getElementById("navDrawerBody");
    if (drawer) drawer.scrollTop = 0;

    const first = document.querySelector("#navDrawerBody .drawer-option");
    if (first) first.focus({ preventScroll: true });
  }, 30);
}

function updateTimeColumns(previousScrolls = [], preserveThroughIndex = -1){
  const body = $("#navDrawerBody");
  body.empty();
  renderTimeDesktopChooser(body);
  const lists = body.find(".time-column-list");
  lists.each(function(index){
    if (index <= preserveThroughIndex && previousScrolls[index] != null) {
      this.scrollTop = previousScrolls[index];
    }
  });
}

function getNavItems() {
  const root = navState.currentRoot;
  if (root === "tid") {
    const tid = appNavData.tid || { decades: [] };
    if (navState.stack.length === 0) {
      return tid.decades.map(dec => ({
        label: dec.id,
        meta: dec.years?.length ? dec.years.length + " år" : "",
        hasChildren: true,
       onSelect: () => {
  advanceTidNav(
    [{ label: dec.id, node: dec }]  );
}
      }));
    }
    if (navState.stack.length === 1) {
      const dec = navState.stack[0].node;
      return (dec.years || []).map(yr => ({
        label: yr.id,
        meta: yr.months?.length ? yr.months.length + " måneder" : "",
        hasChildren: true,
        onSelect: () => {
  advanceTidNav(
    [
      navState.stack[0],
      { label: yr.id, node: yr }
    ]);
}
      }));
    }
    const yr = navState.stack[1].node;
    return (yr.months || []).map(m => ({
      label: m.id,
      meta: typeof m.count === "number" ? m.count + " billeder" : "Måned",
      hasChildren: false,
      key: "tid:" + m.id,
      onSelect: () => selectAndApply({
        key: "tid:" + m.id,
        label: "Tid: " + navState.stack[0].label + " › " + navState.stack[1].label + " › " + m.id,
        action: () => injectMonth(m.id)
      })
    }));
  }

  if (root === "sted") {
    return (appNavData.sted || []).map(a => ({
      label: a.name,
      meta: typeof a.count === "number" ? a.count + " billeder" : "Område",
      hasChildren: false,
      key: "sted:" + a.id,
      onSelect: () => selectAndApply({
        key: "sted:" + a.id,
        label: "Sted: " + a.name,
        action: () => injectArea(a.id)
      })
    }));
  }

  if (root === "anvendelse") {
    const anv = appNavData.anvendelse || { groups: [] };
    if (navState.stack.length === 0) {
      return (anv.groups || []).map(group => ({
        label: group.group,
        meta: group.trips?.length ? group.trips.length + " ture" : "",
        hasChildren: true,
        onSelect: () => { navState.stack.push({ label: group.group, node: group }); navState.pendingSelection = null; renderNavDrawer(); }
      }));
    }
    const group = navState.stack[0].node;
    return (group.trips || []).map(trip => ({
      label: trip.title,
      meta: buildTripMeta(trip),
      hasChildren: false,
      key: "anv:" + trip.id,
      onSelect: () => selectAndApply({
        key: "anv:" + trip.id,
        label: "Anvendelse: " + trip.title,
        action: () => injectTrip(trip.id, trip.filename, trip.startDate, trip.endDate)
      })
    }));
  }

  return [];
}

function renderTimeDesktopChooser($body) {
  const tid = appNavData.tid || { decades: [] };
  const selectedDecade = navState.stack[0]?.node || tid.decades?.[0] || null;
  const selectedYear = navState.stack[1]?.node || selectedDecade?.years?.[0] || null;

  if (selectedDecade && (!navState.stack[0] || navState.stack[0].node !== selectedDecade)) {
    navState.stack[0] = { label: selectedDecade.id, node: selectedDecade };
  }
  if (selectedYear && (!navState.stack[1] || navState.stack[1].node !== selectedYear)) {
    navState.stack[1] = { label: selectedYear.id, node: selectedYear };
  }
  navState.stack = navState.stack.filter(Boolean).slice(0, 2);

  const columns = [
    {
      title: 'Årtier',
      items: tid.decades || [],
      selectedId: selectedDecade?.id,
      empty: 'Ingen årtier',
      click: dec => {
        const scrolls = captureTimeColumnScrolls();
        navState.stack = [{ label: dec.id, node: dec }];
        if (dec.years?.length) {
          navState.stack.push({ label: dec.years[0].id, node: dec.years[0] });
        }
        updateTimeColumns(scrolls, 0);
      },
      mapItem: dec => ({ label: dec.id, meta: dec.years?.length ? dec.years.length + ' år' : '' })
    },
    {
      title: 'År',
      items: selectedDecade?.years || [],
      selectedId: selectedYear?.id,
      empty: 'Vælg først et årti',
      click: yr => {
        const scrolls = captureTimeColumnScrolls();
        navState.stack = [{ label: selectedDecade.id, node: selectedDecade }, { label: yr.id, node: yr }];
        updateTimeColumns(scrolls, 1);
      },
      mapItem: yr => ({ label: yr.id, meta: yr.months?.length ? yr.months.length + ' måneder' : '' })
    },
    {
      title: 'Måneder',
      items: selectedYear?.months || [],
      selectedId: navState.activeSelection?.key?.startsWith('tid:') ? navState.activeSelection.key.replace('tid:', '') : null,
      empty: 'Vælg først et år',
      click: m => selectAndApply({
        key: 'tid:' + m.id,
        label: 'Tid: ' + selectedDecade.id + ' › ' + selectedYear.id + ' › ' + m.id,
        action: () => injectMonth(m.id)
      }),
      mapItem: m => ({ label: m.id, meta: typeof m.count === 'number' ? m.count + ' billeder' : 'Måned' })
    }
  ];

  columns.forEach(column => {
    const $col = $('<section/>', { class: 'time-column' }).appendTo($body);
    $('<h3/>', { class: 'time-column-title', text: column.title }).appendTo($col);
    const $list = $('<div/>', { class: 'time-column-list' }).appendTo($col);
    if (!column.items.length) {
      $('<div/>', { class: 'time-column-empty', text: column.empty }).appendTo($list);
      return;
    }
    column.items.forEach(entry => {
      const info = column.mapItem(entry);
      const isSelected = column.selectedId === entry.id;
      const $btn = $('<button/>', {
        type: 'button',
        class: 'drawer-option time-column-option' + (isSelected ? ' is-selected' : '')
      }).appendTo($list);
      const $main = $('<span/>', { class: 'drawer-option-main' }).appendTo($btn);
      $('<span/>', { class: 'drawer-option-label', text: info.label }).appendTo($main);
      if (info.meta) $('<span/>', { class: 'drawer-option-meta', text: info.meta }).appendTo($main);
      $btn.on('click', () => column.click(entry));
    });
  });

  
}
function renderNoDateButton($target) {
  const isSelected = navState.activeSelection?.key === 'tid:no-date';

  return $('<button/>', {
    type: 'button',
    class: 'drawer-footer-btn drawer-no-date-btn' + (isSelected ? ' is-selected' : ''),
    text: 'Uden tidsstempel'
  }).on('click', function () {
    selectAndApply({
      key: 'tid:no-date',
      label: 'Tid: uden tidsstempel',
      action: injectNoDate
    });
  }).appendTo($target);
}

function renderNavDrawer() {
  $("#navDrawerTitle").text(getDrawerTitle());
  $("#navBreadcrumb").text(isDesktopTimeChooser() ? "" : getBreadcrumbText());
  $("#navDrawerHint").text(getDrawerHint());
  $("#navDrawerBack").toggleClass("is-hidden", navState.stack.length === 0 || isDesktopTimeChooser());

  const $body = $("#navDrawerBody");
  
  $body
  .removeClass("layout-grid layout-list layout-time-columns nav-root-tid nav-root-sted nav-root-anvendelse")
  .addClass(getCurrentLayoutClass() + " nav-root-" + navState.currentRoot)
  .empty();

 if (isDesktopTimeChooser()) {
  renderTimeDesktopChooser($body);

  const $footer = $(".nav-drawer-footer");
  $footer.find(".drawer-no-date-btn").remove();

  if (navState.currentRoot === "tid") {
    renderNoDateButton($footer);
  }

  return;
}

  if (navState.currentRoot === "tid" && navState.stack.length === 0) {
    const isSelected = navState.activeSelection?.key === "tid:no-date";
    $("<button/>", {
      type: "button",
      class: "drawer-secondary-option" + (isSelected ? " is-selected" : ""),
      text: "Billeder uden tidsstempel"
    }).on("click", function () {
      selectAndApply({
        key: "tid:no-date",
        label: "Tid: uden tidsstempel",
        action: injectNoDate
      });
    }).appendTo($body);
  }

  const items = getNavItems();
  if (!items.length) {
    $body.append($("<div/>", { class: "tileboxMsg", text: "Ingen valg tilgængelige endnu." }).css({ position: "static", margin: 0 }));
  }

  items.forEach(item => {
    const isSelected = navState.activeSelection?.key && item.key === navState.activeSelection.key;
    const $btn = $("<button/>", {
      type: "button",
     class: "drawer-option drawer-option-" + navState.currentRoot + (isSelected ? " is-selected" : "")
    });
    const $main = $("<span/>", { class: "drawer-option-main" }).appendTo($btn);
    $("<span/>", { class: "drawer-option-label", text: item.label }).appendTo($main);
    if (item.meta) {
      $("<span/>", { class: "drawer-option-meta", text: item.meta }).appendTo($main);
    }
    $("<span/>", { class: "drawer-chevron", html: item.hasChildren ? "›" : "Åbn" }).appendTo($btn);
    $btn.on("click", item.onSelect);
    $body.append($btn);
  });


}

function updateSelectionLabel() {
  const el = $("#activeSelection");
  if (navState.activeSelection) {
    el.text(navState.activeSelection.label).show();
  } else {
    el.hide();
  }
}

function restoreHomeSplash() {
  window.location.href = "#initial";
  const $tilebox = $("#tilebox");
  $tilebox.stop(true, true).empty();
  $tilebox.append($("<img/>", { src: "lillehest.png", class: "lillehest", width: "60%", alt: "" }));
}

function resetCurrentSelection() {
  navState.pendingSelection = null;
  navState.activeSelection = null;
  navState.stack = [];
  updateSelectionLabel();
  closeNavDrawer();
  $(".toolbar-btn[data-nav-root]").removeClass("is-active");
  restoreHomeSplash();
}

function handleDrawerKeyNav(e) {
  const $focusables = $("#navDrawer .drawer-option:visible, #navDrawer .drawer-action:visible, #navDrawer .drawer-footer-btn:visible, #navDrawer .drawer-secondary-option:visible");
  const currentIndex = $focusables.index(e.currentTarget);
  if (e.key === "ArrowDown" || e.key === "ArrowRight") {
    e.preventDefault();
    $focusables.eq(Math.min(currentIndex + 1, $focusables.length - 1)).trigger("focus");
  } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
    e.preventDefault();
    if (e.key === "ArrowLeft" && navState.stack.length > 0) {
      stepBackNav();
    } else {
      $focusables.eq(Math.max(currentIndex - 1, 0)).trigger("focus");
    }
  } else if (e.key === "Escape") {
    closeNavDrawer();
  }
}



/* SECTION main setup of environment */






//new function from ChatGPT

//setup datasources
//function started by index.html
function loadData(){
  $('select').selectmenu().selectmenu('disable');

  // NEW: load the three indexes
  $.getJSON("data/tid/index.json", function(json) {
    tidIndex = json;
    makeMonthLinksFromIndex(tidIndex);
	indexLoadedOne();
  });

  $.getJSON("data/sted/index.json", function(json) {
    stedIndex = json;
     makeAreaLinksFromIndex(stedIndex);
	 indexLoadedOne();
  });

$.getJSON("data/anvendelse/index.json", function(json) {
  anvIndex = json;
  makeTripLinksFromIndex(anvIndex);
  indexLoadedOne();
});


/*
  $('#totalcount').html("—");
$('#datedcount').html("—");
$('#gtcount').html("—");
*/
//get stats form tiny generated datafile
$.getJSON("data/stats.json", function(s){
  $('#totalcount').html(s.total);
  $('#datedcount').html(s.dated);
  $('#gtcount').html(s.geotagged);
});
}




//fill areas dropdown - enable actions on select

function makeAreaLinksFromIndex(stedIndex){
  appNavData.sted = stedIndex || [];
  updateNavAvailability();
}

//fill trip dropdown - enable actions on select




function makeTripLinksFromIndex(anvIndex){
  appNavData.anvendelse = anvIndex || { groups: [] };
  updateNavAvailability();
}

function makeMonthLinksFromIndex(tidIndex){
  appNavData.tid = tidIndex || { decades: [] };
  updateNavAvailability();
}


//fill months dropdown - enable action on select to load thumbs from the month
/* SECTION functions to control the population of the thumbpage or the map*/



//Generic dataset loader
function loadDataset(url, onReady) {
  if (currentDatasetXHR) {
    try { currentDatasetXHR.abort(); } catch (_) {}
    currentDatasetXHR = null;
  }

  currentDatasetXHR = $.getJSON(url, function (json) {
    currentDatasetXHR = null;
    setCurrentDataset(json);
    onReady(currentDataset);
  }).fail(function (xhr, status) {
    currentDatasetXHR = null;
    if (status !== "abort") alert("Could not load dataset: " + url);
  });
}


//check desired state
function isListMode(){
return document.getElementById("Choice-of-list").checked;
}


//--------The loader functions



function injectNoDate(){
	cancelBuildTiles();
	loadDataset("data/problems/no-timestamp.geo.json", (ds) => {
	if (isListMode()) {
	buildTiles(ds);
  hideMainToolbar();
	} else {
		showOnMap(getGeotaggedFeatures(ds));
	window.location.href = "#mappage";
	}
});
}




  



function injectMonth(month){
	cancelBuildTiles();	
	loadDataset("data/tid/" + month + ".geo.json", (ds) => {
	if (isListMode()) {
	buildTiles(ds);
  hideMainToolbar();
	} else {
		showOnMap(getGeotaggedFeatures(ds));
	window.location.href = "#mappage";
	}
	});
}






//--------BEGIN NEW function from ChatGPT
function injectTrip(tripId, KMLfile, startDate, endDate){
	cancelBuildTiles();
    tripPixDates.startDate = startDate;
    tripPixDates.endDate = endDate;
	loadDataset("data/anvendelse/" + tripId + ".geo.json", (ds) => {
		if (isListMode()) {
			buildTiles(ds);
      hideMainToolbar();
		} else {
			UseOnMap(KMLfile);
			window.location.href = "#mappage" 
		}
	});
}



  

//-------- END NEW function from ChatGPT
function injectArea(areaId){
	cancelBuildTiles();
	loadDataset("data/sted/" + areaId + ".geo.json", (ds) => {
	if (isListMode()) {
		buildTiles(ds);
    hideMainToolbar();
	} else {
		showOnMap(getGeotaggedFeatures(ds));
		window.location.href = "#mappage";
	}
	});
}





/* SECTION Display builders*/
//Thumbpage, imgpage, mappage, trippage

//build the thumbpage
function buildTiles(dataslice) {
    lastViewMode = "thumbs";
  cancelBuildTiles();
  const myToken = buildTilesToken;
  ensureThumbObserver(myToken);

  const $tilebox = $("#tilebox");
  $tilebox.stop(true, true);
  $tilebox.empty();
  $tilebox.scrollTop(0); // avoid long queued "slow" animations
 $tilebox.append($("<div/>").css({ width: "100%", height: "0.75em" }));

  const feats = (dataslice && dataslice.features) ? dataslice.features : [];
  const groupMap = new Map(); // dateKey -> array of features

  // Same dateKey logic as your old groupBy
  function dateKeyForFeature(feature) {
    const ts = feature?.properties?.timestamp;
    if (ts) return ts.split("T")[0];

    const img = feature?.properties?.image || "";
    return img
      .substring(0, img.lastIndexOf("/"))
      .split(" ").join("_")
      .split("/").join("_")
      .substring(2);
  }

  // ---- Phase 1: build groups in chunks (cancelable) ----
  let i = 0;
  const GROUP_CHUNK = 1200; // tune: bigger = faster, smaller = more responsive

  function buildGroupsStep() {
    if (myToken !== buildTilesToken) return;

    const end = Math.min(i + GROUP_CHUNK, feats.length);
    for (; i < end; i++) {
      const f = feats[i];
      const k = dateKeyForFeature(f);
      let arr = groupMap.get(k);
      if (!arr) {
        arr = [];
        groupMap.set(k, arr);
      }
      arr.push(f);
    }

    if (i < feats.length) {
      requestAnimationFrame(buildGroupsStep);
    } else {
      // When grouping is done, render
      startRender();
    }
  }

  // ---- Phase 2: render groups + tiles in batches (cancelable) ----
  function startRender() {
    if (myToken !== buildTilesToken) return;

    // Sort dates for stable output (optional)
    const dates = Array.from(groupMap.keys()).sort();
    let d = 0; // date index
    let fIndex = 0; // feature index within date group

    const RENDER_BATCH = 80; // tiles per frame (tune)

    function renderStep() {
      if (myToken !== buildTilesToken) return;

      let rendered = 0;

      while (d < dates.length && rendered < RENDER_BATCH) {
        const dateKey = dates[d];
        const arr = groupMap.get(dateKey) || [];

        // Create header + container once per date
        if (fIndex === 0) {
          const headerText =
            dateKey.indexOf("_") > -1
              ? dateKey
              : new Intl.DateTimeFormat("da-DK", { dateStyle: "full" }).format(new Date(dateKey));

          $tilebox.append(
            $("<div/>", { class: "dateDiv" })
              .append(
                $("<div/>", { class: "dateHeader", text: headerText })
                  .append(
                    $("<input/>", {
                      type: "button",
                      id: "loadDateImages",
                      name: "loadDateImages",
                      value: "load dato i geotagger",
                    }).on("click", function () {
                      UseOnMap(undefined, dateKey);
                      window.location.href = "#mappage";
                    })
                  )
              )
              .append($("<div/>", { class: "dateDivMain", id: "dateDiv-" + dateKey }))
          );
        }

        // Render tiles for this date
        const $dateDiv = $("#dateDiv-" + dateKey);

        while (fIndex < arr.length && rendered < RENDER_BATCH) {
          const feature = arr[fIndex++];
          const img = "/Foto/" + feature.properties.image;
          const thumbPath =
            img.substring(0, img.lastIndexOf("/")) +
            "/.thumb/thumb-" +
            img.substring(img.lastIndexOf("/") + 1);

          const $tile = $("<div/>", {
            class: "tile",
            title: feature.properties.timestamp ? feature.properties.timestamp : feature.properties.image,
          }).css({ cursor: "pointer" });

          const $thumb = $("<img>", {
            height: "100px",
            loading: "lazy",
            fetchpriority: "low",
            decoding: "async",
            id: "th-" + feature.properties.index,
            src: THUMB_PLACEHOLDER,
            "data-src": thumbPath,
          }).on("click", function () {
            if (myToken !== buildTilesToken) return;
            thumbPageScroll = window.pageYOffset;
            window.location.href = "#page-" + imgPage(feature.properties.index);
          });

          $tile.append($thumb);

          if (feature.geometry) {
            $tile.append(
              $("<button/>", {
                href: "#",
                "data-role": "Button",
                "data-icon": "ui-icon-location",
                "data-show-label": "false",
                class:
                  "ui-icon ui-button ui-button-icon-only ui-widget ui-icon-location ui-corner-all ui-alt-icon",
              }).css({ position: "absolute", bottom: "5px", right: "10px" })
            );
          }

          $dateDiv.append($tile);

          // Observe AFTER append (and only for tiles)
          if (thumbObserver) thumbObserver.observe($thumb[0]);

          rendered++;
        }

        // Done with this date group?
        if (fIndex >= arr.length) {
          d++;
          fIndex = 0;
        }
      }

      if (myToken !== buildTilesToken) return;

      if (d < dates.length) {
        requestAnimationFrame(renderStep);
      } else {
        // Finished all rendering; optional "Vis på kort" logic can stay as you had it.
        if ($(".geomarker").length > 0) {
          $tilebox.append(
            $("<button/>", {
              "data-role": "button",
              "data-enhanced": "true",
              class: "ui-button ui-button-inline ui-corner-all ui-shadow ui-widget",
            })
              .text("Vis på kort")
              .css({ position: "absolute", top: "2%", right: "2%" })
              .on("click", function () {
                showOnMap({
                  type: "FeatureCollection",
                  features: (dataslice || []).filter(feature => feature && feature.geometry),
                });
                window.location.href = "#mappage";
              })
          );
        }
      }
    }

    requestAnimationFrame(renderStep); 
  }

  requestAnimationFrame(buildGroupsStep);
}



//Preloader - runs when imgPage is called
// --- Preload control (keep main image priority) ---
let preloadIdleHandle = null;

function preloadAround(i, radius = 3) {
  if (!currentDataset?.features) return;

  // Cancel any previous scheduled preload burst (helps when user browses quickly)
  if (preloadIdleHandle) {
    if (window.cancelIdleCallback) cancelIdleCallback(preloadIdleHandle);
    clearTimeout(preloadIdleHandle);
    preloadIdleHandle = null;
  }

  const run = () => {
    // Start preloads AFTER the browser has had a chance to start rendering/loading the main image
    for (let k = i - radius; k <= i + radius; k++) {
      if (k < 0 || k >= currentDataset.features.length) continue;

      const rel = currentDataset.features[k]?.properties?.image;
      if (!rel) continue;

      // Use same base path as your displayed images
      const url = "/Foto/" + rel;

      const pre = new Image();

      // Hint to browser: this is low importance
      // (supported in Chromium; harmless elsewhere)
      try {
        pre.fetchPriority = "low";
        pre.decoding = "async";
      } catch (_) {}

      pre.src = url;
    }
  };

  // Use idle time if available; otherwise small timeout
  if (window.requestIdleCallback) {
    preloadIdleHandle = requestIdleCallback(run, { timeout: 1200 });
  } else {
    preloadIdleHandle = setTimeout(run, 200);
  }
}

//Create the imagepage to display one photo	
function imgPage(imageIndex){
	currentImageIndex = imageIndex
	var info = currentDataset.features[imageIndex].properties //Metadata of the current image

const $mainImg = $("<img>", {
  src: "/Foto/" + currentDataset.features[imageIndex].properties.image,
  id: "image0",
  fetchpriority: "high",
  decoding: "async"
}).css({
  "max-height": $(window).height() - 6 + "px",
  "max-width": $(window).width() - 6 + "px",
  "display": "block",
  "margin-right": "auto",
  "margin-left": "auto"
});

// IMPORTANT: start preloading only after main image has loaded (or is already cached)
if ($mainImg[0].complete) {
  preloadAround(imageIndex);
} else {
  $mainImg.one("load", function () {
    preloadAround(imageIndex);
  });
}


		$("<div/>",{"data-role":"page", "class":"jqm-demos ui-page ui-page-theme-b ui-page-active imagepage", "data-quicklinks":"true", "id":"page-" + imageIndex})
			.appendTo($("body"))
			//Infopanel
			
			.append($("<div/>",{"data-role":"panel", "data-display":"push","class":"infopanel","id":"iPanel" })
					//luk infopanel knap
					.append($("<a/>",{"href":"#","data-role":"button", "data-rel":"close","data-enhanced":"true", "class":"ui-icon ui-button ui-button-icon-only ui-widget ui-icon-delete ui-corner-all"})
						.text("No text")
						.css({"position":"absolute","top":"5%","left":"5%"})
					)
					//Infobox
					.append($('<div/>',{"class": "infobox","class":"infobox"})
						.append($("<table/>",{"class":"infotable"})
							.css({"position":"absolute","top":"5em","border-spacing": "10px"})
							.append($("<tr/>")
								//image path
								.append($("<td/>").text("Hvad:").css({"color":"Turquoise"}))
								.append($("<td/>").text(info.image.split("Foto")[1]).css({"border-left":"Turquoise solid 1px","border-radius":"5px"}))
								//copy to clipboard (path and URL)
								.append($("<td/>",{title:"kopier sti"}).html("&#128449;").on("click",function(){setClipboard("Z:\\Foto" + info.image.split("Foto")[1].substring(0,info.image.split("Foto")[1].lastIndexOf('/') +1).split("/").join("\\"))}).css("cursor","pointer"))
								.append($("<td/>",{title:"kopier weblink"}).html("&#128376;").on("click",function(){setClipboard(info.image)}).css("cursor","pointer"))
								)
							.append($("<tr/>")
								//Image date
								.append($("<td/>").text("Hvornår:").css({"color":"Turquoise"}))
								.append($("<td/>").text(new Intl.DateTimeFormat('da-DK',{ dateStyle: 'full', timeStyle: 'short' }).format(new Date(info.timestamp?info.timestamp:"2022-12-24"))).css({"border-left":"Turquoise solid 1px","border-radius":"5px"}))
								)
							.append($("<tr/>")
								//camera used
								.append($("<td/>").text("Hvordan:").css({"color":"Turquoise"}))
								.append($("<td/>").text( info.camera).css({"border-left":"Turquoise solid 1px","border-radius":"5px"}))
								)
							
							))
							
					)
			//Main page/display		
			.append($('<div/>',{"class":"pagecontents","data-role":"content"})
				.append($('<div/>',{"class":"ui-panel-wrapper"})
					//the image
					.append($mainImg)
					
					
					//button to close image
					.append($("<button/>",{"data-role":"button", "data-enhanced":"true", "class":"ui-icon ui-button ui-button-icon-only ui-widget ui-icon-delete ui-corner-all"})
						.text("No text")
						.css({"position":"absolute","top":"2%","right":"2%"})
						.on( "click", function(){
              $(".imagepage").remove();
							//if the trip interface is open, we should not close it when closing imgpage
							//if (document.getElementsByClassName("trippix").length > 0)
            if (lastViewMode === "map") {
            window.location.href = "#mappage";
            } else {
            window.location.href = "#initial";
            setTimeout(function(){
                window.scrollBy(0,thumbPageScroll);
            },200);
            }
						
					})
					)
					//open infopanel
					.append($("<a/>",{ "href":"#iPanel","data-enhanced":"true", "class":"ui-icon ui-button ui-button-icon-only ui-widget ui-icon-info ui-corner-all"})
						.text("No text")
						.css({"position":"absolute","top":"2%","left":"2%"})
					)
					//browse back	
					.append($("<button/>",{"data-role":"button", "data-enhanced":"true", "class":"ui-icon ui-button ui-button-icon-only ui-widget ui-corner-all"})
            .addClass(imageIndex > 0?"ui-icon-arrow-l":"ui-icon-forbidden")
						.text("No text")
						.css({"position":"absolute","top":"49%","left":"2%"})
						.on( "click", function(){bladr(false)})
					)
					//browse forward 
					.append($("<button/>",{"data-role":"button", "data-enhanced":"true", "class":"ui-icon ui-button ui-button-icon-only ui-widget ui-corner-all"})
						.text("No text")
            .addClass(imageIndex !== currentDataset.features.length-1?"ui-icon-arrow-r":"ui-icon-forbidden")
						.css({"position":"absolute","top":"49%","right":"2%"})
						.on( "click", function(){bladr(true)})
					)
					//if image is geocoded then show button
					.append((currentDataset.features[imageIndex].geometry)
						?
						$("<button/>",{"data-role":"button", "data-enhanced":"true", "class":"ui-icon ui-button ui-button-icon-only ui-widget ui-icon-location ui-corner-all"})
							.text("No text")
							.css({"position":"absolute","top":"2%","right":"12%"})
							.on("click", function( event ) {
							  $(".imagepage").remove();
                 if (!$(".mappage").length) {
               	    loc = showOnMap({"type":"FeatureCollection","features":[currentDataset.features[imageIndex]]})
                    window.location.href = "#" + loc
                 }
							 })
						:
						"")
						
					//show open slideshow menu button or show stop slideshow button
					.append($("<button/>",{"id":"slideshowButton","title":(slideShowOn)?"Stop Slideshow":"Slideshow","data-role":"button", "data-enhanced":"true", "class":"ui-icon ui-button ui-button-icon-only ui-widget ui-corner-all"})
							.addClass((slideShowOn)?"ui-icon-forbidden":"ui-icon-caret-r") //show either stop or play button face
							.text("No text")
							.css({"position":"absolute","bottom":"2%","right":"2%"})
							.on("click",{id:imageIndex},function(e){
								if (slideShowOn) // the slideshow is running
								{
									clearInterval(slideShowOn) //stop the slideshow timer
									slideShowOn = undefined	
									$("#page-" + currentImageIndex).remove()
									window.location.href = "#page-" + imgPage(currentImageIndex) 
								}
								else //slideshow is not running
								{
									$(".ui-panel-wrapper" ).append( 
										$("<select/>",{id:"slideshowSelect","data-native-menu":"false", "data-mini":"true"})//build dropdown
											.css({"position":"absolute","bottom":"2%","right":"2%"})
											.append($("<option/>",{text:"Slideshow"})) 
											.on( "change", function( event ) { //On selection 
												clearInterval(slideShowOn)
												slideShowOn = setInterval(function(){ //timer function
													bladr(Boolean(event.target.value.split("#")[0])) //call the browse function
													}
													,parseInt(event.target.value.split("#")[1])//set the timer according to selection data
												)
											})
									)
									//values for the dropdown
									$([[">1 sek>" ,[true,"1000"]],[">3 sek>",[true,"3000"]],[">5 sek>",[true,"5000"]],[">10 sek>",[true,"10000"]],["<1 sek<" ,["","1000"]],["<3 sek<",["","3000"]],["<5 sek<",["","5000"]],["<10 sek<",["","10000"]]])
										.each(function(dit,dyt){//to be added
											$("#slideshowSelect").append( $("<option/>",{text:dyt[0],value:dyt[1][0] + "#" + dyt[1][1]}))
										})
									$("#slideshowButton").remove()
								}
							})
						)
					)				
				)
	return  imageIndex //for the navigation in the calling function
}
/*subsection: helpers for imgpage */


//	browsing images back and forth - accepts boolean to indicate direction (true=forth, false=back)
//currentDataset.features.length
	function bladr (forth){
		var focusImageIndex = currentImageIndex
    if ((forth && (focusImageIndex == currentDataset.features.length-1))||(!forth && (focusImageIndex == 0)))
    {
      return;
    }
 		window.location.href = "#page-" + imgPage(focusImageIndex + ((forth)?1:-1));
		$("#page-" + focusImageIndex).remove();
		/*
		//Preload images
		preloadAround(focusImageIndex)
		
		*/
	}
//Put image metadata on computer clipboard - called by infobox buttons
function setClipboard(value) {
    var tempInput = document.createElement("input");
    tempInput.style = "position: absolute; left: -1000px; top: -1000px";
    tempInput.value = value;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand("copy");
    document.body.removeChild(tempInput);
}



let photoMarkers = [];
let photoInfoWindow = null;

let activeSpiderGroup = null;
let activeSpiderLines = [];
let activeSpiderMouseMove = null;

function makePhotoThumbUrl(feature) {
  const img = feature?.properties?.image;
  if (!img) return "";

  return "Foto/" +
    img.substring(0, img.lastIndexOf("/")) +
    "/.thumb/thumb-" +
    img.substring(img.lastIndexOf("/") + 1);
}

function openPhotoPreview(feature, position) {
  closeAllInfoWindows();

  const thumbUrl = makePhotoThumbUrl(feature);
  if (!thumbUrl) return;

  const div = document.createElement("div");
  const t = document.createElement("img");

  t.src = thumbUrl;
  t.style.height = "150px";

  div.appendChild(t);

  photoInfoWindow.setContent(div);
  photoInfoWindow.setPosition(position);
  photoInfoWindow.setOptions({ pixelOffset: new google.maps.Size(0, -20) });
  photoInfoWindow.open(map);

  google.maps.event.addListenerOnce(photoInfoWindow, "domready", () => {
  const iw = document.querySelector(".gm-style-iw");
  if (iw) {
    iw.style.pointerEvents = "none";
  }
});
}

function openPhotoImage(feature, removeMapBeforeImage) {
  const featureIndex = feature?.properties?.index;
  if (featureIndex == null) return;

  // Keep the map alive underneath the image page.
  // Closing the image can then return to the same map position.
  imgPage(featureIndex);
}

function photoCoordKey(feature) {
  const c = feature?.geometry?.coordinates;
  if (!c || c.length < 2) return "";
  return Number(c[1]).toFixed(7) + "," + Number(c[0]).toFixed(7);
}

function groupPhotoMarkersByCoordinate(markers) {
  const groups = new Map();

  markers.forEach(marker => {
    const key = marker.__photoCoordKey;
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(marker);
  });

  return groups;
}

function latLngToPixel(latLng) {
  const projection = map.getProjection();
  const zoom = map.getZoom();
  const scale = Math.pow(2, zoom);
  const point = projection.fromLatLngToPoint(new google.maps.LatLng(latLng));
  return {
    x: point.x * scale,
    y: point.y * scale
  };
}

function pixelToLatLng(pixel) {
  const projection = map.getProjection();
  const zoom = map.getZoom();
  const scale = Math.pow(2, zoom);
  const point = new google.maps.Point(pixel.x / scale, pixel.y / scale);
  return projection.fromPointToLatLng(point).toJSON();
}

function offsetLatLngByPixels(origin, dx, dy) {
  const p = latLngToPixel(origin);
  return pixelToLatLng({
    x: p.x + dx,
    y: p.y + dy
  });
}

function clearSpiderLines() {
  activeSpiderLines.forEach(line => line.setMap(null));
  activeSpiderLines = [];
}

function collapseSpiderGroup() {
  if (!activeSpiderGroup) return;

  activeSpiderGroup.forEach(marker => {
    marker.position = marker.__photoBasePosition;
    marker.zIndex = undefined;
  });

  clearSpiderLines();

  if (activeSpiderMouseMove) {
    google.maps.event.removeListener(activeSpiderMouseMove);
    activeSpiderMouseMove = null;
  }
activeSpiderGroup.forEach(marker => {
  const group = marker.__photoGroup || [];
  if (group.length > 1) {
    marker.__amAnim?.classList.add("photo-multi");
  }
});
  activeSpiderGroup = null;
  closeAllInfoWindows();
}

function spiderfyGroup(group) {
  collapseSpiderGroup();

  if (!group || group.length < 2) return;

  activeSpiderGroup = group;
  group.forEach(marker => {
  marker.__amAnim?.classList.remove("photo-multi");
});

  const origin = group[0].__photoBasePosition;
  const radius = Math.min(76, 28 + group.length * 5);

  group.forEach((marker, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i / group.length);
    const dx = Math.cos(angle) * radius;
    const dy = Math.sin(angle) * radius;

    const spreadPosition = offsetLatLngByPixels(origin, dx, dy);

    marker.__photoSpreadPosition = spreadPosition;
    marker.position = spreadPosition;
    marker.zIndex = 10000 + i;

const line = new google.maps.Polyline({
  map,
  path: [
    new google.maps.LatLng(origin.lat, origin.lng),
    new google.maps.LatLng(
      spreadPosition.lat,
      spreadPosition.lng
    )
  ],
  strokeColor: "#111",
  strokeOpacity: 0.9,
  strokeWeight: 2,
  clickable: false,
  zIndex: 1
});
    activeSpiderLines.push(line);
  });

  activeSpiderMouseMove = map.addListener("mousemove", e => {
    const mouse = latLngToPixel(e.latLng);
    const center = latLngToPixel(origin);
    const dist = Math.hypot(mouse.x - center.x, mouse.y - center.y);

    if (dist > radius + 45) {
      collapseSpiderGroup();
    }
  });
}


function openPhotoFlyout(feature, position, removeMapBeforeImage) {
  closeAllInfoWindows();

  const thumbUrl = makePhotoThumbUrl(feature);
  const featureIndex = feature?.properties?.index;
  if (!thumbUrl) return;

  const div = document.createElement("div");
  const t = document.createElement("img");

  t.src = thumbUrl;
  t.style.height = "150px";
  t.style.cursor = "pointer";

  t.onclick = function () {
    if (removeMapBeforeImage) {
      $(".mappage").remove();
      exitMapMode();
      hideMainToolbar();
    }
    imgPage(featureIndex);
  };

  div.appendChild(t);

  photoInfoWindow.setContent(div);
  photoInfoWindow.setPosition(position);
  photoInfoWindow.setOptions({ pixelOffset: new google.maps.Size(0, -20) });
  photoInfoWindow.open(map);
}

function wirePhotoMarker(marker, feature, position, removeMapBeforeImage) {
  marker.__feature = feature;
  marker.__photoBasePosition = position;
  marker.__photoCoordKey = photoCoordKey(feature);

  marker.addListener("gmp-click", () => {
    const group = marker.__photoGroup || [marker];

    if (group.length > 1 && activeSpiderGroup !== group) {
      spiderfyGroup(group);
      return;
    }

    openPhotoImage(feature, removeMapBeforeImage);
  });

if (marker.content) {
let hoverTimer = null;

marker.content.addEventListener("pointerenter", () => {
  clearTimeout(hoverTimer);

  const group = marker.__photoGroup || [marker];

  if (group.length > 1 && activeSpiderGroup !== group) {
    return;
  }

  hoverTimer = setTimeout(() => {
    const previewPosition =
      marker.__photoSpreadPosition ||
      marker.__photoBasePosition;

    openPhotoPreview(feature, previewPosition);
  }, 120);
});

marker.content.addEventListener("pointerleave", () => {
  clearTimeout(hoverTimer);

  hoverTimer = setTimeout(() => {
    photoInfoWindow.close();
  }, 160);
});
}


}
function enablePhotoSpiderGroups(markers) {
  const groups = groupPhotoMarkersByCoordinate(markers);

  groups.forEach(group => {
group.forEach(marker => {
  marker.__photoGroup = group;

  const anim =
    marker.__amAnim ||
    marker.content?.querySelector(".am-anim");

  if (!anim) return;

  if (group.length > 1) {
    anim.classList.add("photo-multi");
  } else {
    anim.classList.remove("photo-multi");
  }
});
  });
}

function photoMarkerKey(marker) {
  const p = marker.__photoBasePosition;
  if (!p) return "";
  return Number(p.lat).toFixed(7) + "," + Number(p.lng).toFixed(7);
}






// Trip/KML marker info window (single instance so we can close previous popups)
let tripInfoWindow = null;

function closeAllInfoWindows() {
  try { photoInfoWindow?.close(); } catch (_) {}
  try { tripInfoWindow?.close(); } catch (_) {}
}

// Select and reveal a node in the trip jsTree (used when clicking markers)
function selectTreeNode(nodeId) {
  if (!nodeId) return;
  const $tree = $("#treebox");
  if (!$tree.length) return;

  const inst = $tree.jstree(true);
  if (!inst) return;

  // Open all parents so selection is visible
  let p = inst.get_parent(nodeId);
  while (p && p !== "#") {
    inst.open_node(p);
    p = inst.get_parent(p);
  }

  // Select the node (and close any previous selection)
  inst.deselect_all(true);
  inst.select_node(nodeId, true, true);
}

function clearPhotoMarkers() {
  collapseSpiderGroup();
  if (photoCluster) {
    try { photoCluster.clearMarkers(); } catch (_) {}
    try { photoCluster.setMap(null); } catch (_) {}
    photoCluster = null;
  }
  photoMarkers.forEach((m) => { try { m.map = null; } catch (_) {} });
  photoMarkers = [];
}

// Add photo markers onto the CURRENT map (used by trip 'Vis billeder for denne tur')
// Keeps the trip tree + overlays intact, but uses the same AdvancedMarker + InfoWindow behavior as showOnMap().
async function showTripPhotosOnMap(mapFeatureCollection, opts = {}) {
  await markerReady;
  if (!map) return;

  if (!photoInfoWindow) photoInfoWindow = new google.maps.InfoWindow();

  closeAllInfoWindows();
  clearPhotoMarkers();

  const fit = (opts.fit !== false);
  const bounds = new google.maps.LatLngBounds();

  const feats = (mapFeatureCollection && Array.isArray(mapFeatureCollection.features))
    ? mapFeatureCollection.features
    : [];

  feats.forEach((f) => {
    if (!f || !f.geometry || f.geometry.type !== "Point") return;

    const lng = f.geometry.coordinates?.[0];
    const lat = f.geometry.coordinates?.[1];
    if (typeof lat !== "number" || typeof lng !== "number") return;

    const position = { lat, lng };

    const marker = createMarker({
      map,
      position,
      title: String(f.properties?.index ?? ""),
      icon: null,
      draggable: false,
      cssClass: "photo",
      animateDrop: true,
    });

    marker.__feature = f;

photoMarkers.push(marker);
wirePhotoMarker(marker, f, position, false);
bounds.extend(position);

});

enablePhotoSpiderGroups(photoMarkers);

  if (fit && photoMarkers.length) {
    map.fitBounds(bounds, 10);
  }




  if (window.markerClusterer && photoMarkers.length > 1) {
    photoCluster = new markerClusterer.MarkerClusterer({
      map,
      markers: photoMarkers,
      onClusterClick: (e, cluster, map0) => {
        if (cluster.bounds) {
          map0.fitBounds(cluster.bounds);
          return;
        }
        const b = new google.maps.LatLngBounds();
        const ms = cluster.markers || cluster.getMarkers?.() || [];
        ms.forEach((m) => {
          const p = m.position;
          if (!p) return;
          const ll = (typeof p.lat === "function") ? p : new google.maps.LatLng(p.lat, p.lng);
          b.extend(ll);
        });
        map0.fitBounds(b);
      },
    });
  }
}


async function showOnMap(mapFeatureCollection) {
    lastViewMode = "map";
  await markerReady;

  map = mapCreator();

  if (!photoInfoWindow) photoInfoWindow = new google.maps.InfoWindow();
  clearPhotoMarkers();

  const bounds = new google.maps.LatLngBounds();

  mapFeatureCollection.features.forEach((f) => {
    if (!f.geometry || f.geometry.type !== "Point") return;

    const lng = f.geometry.coordinates[0];
    const lat = f.geometry.coordinates[1];
    const position = { lat, lng };

    const marker = createMarker({
      map,
      position,
      title: String(f.properties?.index ?? ""),
      icon: null,           // optionally thumb URL
      draggable: false,
      cssClass: "photo",
      animateDrop: true,
    });

    marker.__feature = f;

 photoMarkers.push(marker);
 wirePhotoMarker(marker, f, position, false);
bounds.extend(position);
  });

  enablePhotoSpiderGroups(photoMarkers);

  if (photoMarkers.length) {
    map.fitBounds(bounds, 10);
  }




  // ---- CLUSTERING ----
  // Requires: <script src="https://unpkg.com/@googlemaps/markerclusterer/dist/index.min.js"></script>
  // which you already have in index.htm
  if (window.markerClusterer && photoMarkers.length > 1) {
photoCluster = new markerClusterer.MarkerClusterer({
  map,
  markers: photoMarkers,

  // Clicking a cluster zooms to its bounds
onClusterClick: (e, cluster, map) => {
  // Newer versions: cluster.bounds
  if (cluster.bounds) {
    map.fitBounds(cluster.bounds);
    return;
  }

  // Fallback: compute bounds from markers
  const b = new google.maps.LatLngBounds();
  const ms = cluster.markers || cluster.getMarkers?.() || [];
  ms.forEach((m) => {
    const p = m.position;
    if (!p) return;
    const ll = (typeof p.lat === "function") ? p : new google.maps.LatLng(p.lat, p.lng);
    b.extend(ll);
  });
  map.fitBounds(b);
},

  // optional tuning:
  // algorithmOptions: { maxZoom: 17 }
});
  }

  return "mappage";
}




//function to make a map showing places from a trip along with a tree representation of the trip
async function UseOnMap(KMLfile,aDate){
    lastViewMode = "map";
      await markerReady;
      if ($(".mappage").length) {
        try {
          if (typeof map !== "undefined" && map) {
            google.maps.event.clearInstanceListeners(map);
          }
        } catch(e){}

        $(".mappage").remove();
        exitMapMode();
        hideMainToolbar();
        map = null;
      }

	mapOverlayId = 0 //reset the number of added overlays (features)
	addedOverlays = [] //the array of features/overlays added to current map
	map = mapCreator() //get a map
	
	

	//add button to open geotagging interface
	const taggerbuttonDiv = document.createElement("div");
  taggerbuttonDiv.className = "app-map-toolbar app-map-toolbar-secondary";
  addMapControl(taggerbuttonDiv, map, "tagger");
  map.controls[google.maps.ControlPosition.RIGHT_CENTER].push(taggerbuttonDiv);

	//create div for the use functions and append it to the mappage	
	var sidepanel = $("<div/>",{"id":"sidepanel"}).css({"height":"100%","width":"33%","align-self":"flex-end","display":"flex","flex-direction":"column"})
	$("#mappage > .pagecontents")
		.css({"display":"flex","flex-direction":"row"})
		.append(sidepanel)
		.children("#mapCanvas").css({"height":"100%","width":"66%"})
	
        
// IMPORTANT: mapCanvas size changes after map creation (flex layout).
// Force Maps to recompute projection/overlay positions immediately (otherwise markers can appear NW until zoom).
requestAnimationFrame(function(){
  google.maps.event.trigger(map, "resize");
  var c = map.getCenter();
  if (c) { map.setCenter(c); }
});

	if (KMLfile){AddTreeBox(KMLfile)}
	if (aDate){taggerInterface(aDate)}
	 
	   return "mappage" //for navigation by the calling function
      
}


function AddTreeBox(KMLfile){

	//add a button to the map for displaying images from the trip's timeframe
	const trippicsDiv = document.createElement("div");
  trippicsDiv.className = "app-map-toolbar app-map-toolbar-trip";
  addMapControl(trippicsDiv, map, "trippics");
  map.controls[google.maps.ControlPosition.TOP_LEFT].push(trippicsDiv);


	var treebox = $("<div/>",{"id":"treebox"}).css({"height":"100%","width":"100%","overflow":"scroll"})
	
	$("#sidepanel").append(treebox)
	//data for the tree
	  var treeData = [];
	  //get data from local KML tripfile
	  var localFile ="./KML/" + KMLfile
	  fetch( localFile, {method:'GET'})
	  .then(response => response.text())
	  .then(xmlString => parseXml(xmlString))
	  .then((xObj) => {//traverse KML data
		  	objX = xObj
			var rootFolder = objX.kml.Document.Folder
			//trip rod
			treeData.push({'text':rootFolder.name['#text'],'kind':"container",'state': {	'opened' : true,'selected' : true},'children':[],'depth':1})
			var treeDataChildren = treeData[0].children
			//each day
			//each day (Folder under root) OR root-level placemarks
			if (rootFolder.Folder){
				if (Array.isArray(rootFolder.Folder)){
					//send the folder to the handling function with context given as the children of the root, folder depth = 2
					$.each(rootFolder.Folder,function(i,fol){ if(fol){ doFolder(fol,treeDataChildren,2); } })
				}
				else{ if(rootFolder.Folder){ doFolder(rootFolder.Folder,treeDataChildren,2); } }
			}

			//Some KML files place Placemarks directly under the root Folder (no subfolders).
			if (rootFolder.Placemark){
				if (Array.isArray(rootFolder.Placemark)){
					$.each(rootFolder.Placemark, function(i,place){ if(place){ doPlacemark(place, treeData[0]); } });
				} else {
					doPlacemark(rootFolder.Placemark, treeData[0]);
				}
			}
		})
		//wait a little and call the folder boounds function on the tree data
		setTimeout(function(){
			calculateFolderBounds(treeData);
			setTimeout(function(){
				//then wait a little bit more and 
				//add the data to the tree
				$('#treebox').jstree({
					'core':  {"multiple" : false,
						'data': treeData
						}
				});
				//Set map bounds to include the bounds of the folders that are children of the root
				ruth = getObjects(treeData,'depth',1) //use helper function to get the folder with depth 1
				if (ruth && ruth[0] && ruth[0].folderBoundsNE && ruth[0].folderBoundsSW) {
					useBounds = new google.maps.LatLngBounds()
					useBounds.extend(ruth[0].folderBoundsNE)
					useBounds.extend(ruth[0].folderBoundsSW)
					map.fitBounds(useBounds,10)
				} else {
					console.warn("Trip has no bounds (maybe empty folder or missing geometries).");
				}
			}, 500)
		  },500)

// make markers "bounce" (CSS) when mouse is over corresponding tree node
$('#treebox').on('hover_node.jstree', function (e, data) {
  if (data.node.original.kind === "point") {
    const overlayTag = addedOverlays.find(o => o.id === data.node.original.id);
    if (!overlayTag) return;

    const jumper = overlayTag.overlay;
    setMarkerBounce(jumper, true);

    $('#treebox').one('dehover_node.jstree', function () {
      setMarkerBounce(jumper, false);
    });
  }
});

	//zoom the map to the bonds of the contents of a clicked tree node	  
	$("#treebox").on('dblclick','.jstree-anchor', function (e) {
		var instance = $.jstree.reference(this),
		node = instance.get_node(this);
		if (node.original.kind === "point"){
			//if the nod represent at point, simply zoom to that point (get it from the array)
			var overlayTag = addedOverlays.find(o => o.id === node.original.id) 
			map.panTo(overlayTag.overlay.position)
			map.setZoom(14)//map.getZoom() + 3)
		}
		if (node.original.kind === "container"){
			//if the node represent a folder, use the folder bounds stored with the node
			if (node.original.folderBoundsNE && node.original.folderBoundsSW){
				useBounds = new google.maps.LatLngBounds()
				useBounds.extend(node.original.folderBoundsNE)
				useBounds.extend(node.original.folderBoundsSW)
				map.fitBounds(useBounds,10)
			} else {
				console.warn("Folder has no bounds (empty).");
			}
		}
		if (node.original.kind === "polyline" || node.original.kind === "polygon"){
			//If the node represent a polyline/polygon, it also should store bounds
			if (node.original.trackBoundsNE && node.original.trackBoundsSW){
				useBounds = new google.maps.LatLngBounds()
				useBounds.extend(node.original.trackBoundsNE)
				useBounds.extend(node.original.trackBoundsSW)
				map.fitBounds(useBounds,10)
			} else {
				console.warn("Track/Polygon has no bounds.");
			}
		}
	});

	//if you click a node, nothing happens...
	$('#treebox').on('select_node.jstree', function (e, data) {
  const node = data?.node;
  if (!node?.original) return;

  // Only point nodes have marker popups
  if (node.original.kind !== "point") return;

  const overlayTag = addedOverlays.find(o => o.id === node.original.id);
  if (!overlayTag?.overlay) return;

  const marker = overlayTag.overlay;

  closeAllInfoWindows();
  if (!tripInfoWindow) tripInfoWindow = new google.maps.InfoWindow();

  // Prefer the node's visible label for the popup
  tripInfoWindow.setContent(node.text || node.original.text || "");

  try {
    // AdvancedMarkerElement: anchor to marker
    tripInfoWindow.open({ map, anchor: marker });
  } catch (_) {
    // Fallback: position-based open
    const pos = markerLatLng(marker) || node.original.Point;
    if (pos) tripInfoWindow.setPosition(pos);
    tripInfoWindow.open({ map });
  }

  // Gentle pan so the popup is comfortably visible
  const pos = markerLatLng(marker) || node.original.Point;
  if (pos) {
    map.panTo(pos);
    // Nudge upward a bit after pan starts (keeps popup away from edges / finger)
    setTimeout(() => { try { map.panBy(0, -120); } catch (_) {} }, 150);
  }
});


}
//Handle a placemark (place) in context of a treemap node (mother)
function doPlacemark(place, mother) {
  mapOverlayId = mapOverlayId + 1; //increment the number of overlays (features) added to the map


  // ---------- POINT ----------
if (place.Point) {
  const position = LatLnger(place.Point.coordinates["#text"]); // {lat,lng}

  // Resolve icon style (Style or StyleMap->normal->Style)
  let styleObj = null;

  const styleUrlText = place?.styleUrl?.["#text"];
  const styleId = styleUrlText ? styleUrlText.substring(1) : null;

  if (styleId && Array.isArray(objX?.kml?.Document?.Style)) {
    const st = objX.kml.Document.Style.find(o => o?.id === styleId);
    if (st?.IconStyle) styleObj = st.IconStyle;
  }

  if (!styleObj && styleId && Array.isArray(objX?.kml?.Document?.StyleMap)) {
    const sm = objX.kml.Document.StyleMap.find(o => o?.id === styleId);
    const pairs = sm?.Pair ? (Array.isArray(sm.Pair) ? sm.Pair : [sm.Pair]) : [];
    const normalPair = pairs.find(p => p?.key?.["#text"] === "normal") || pairs[0];
    const ref = normalPair?.styleUrl?.["#text"];
    const refId = ref ? ref.substring(1) : null;

    if (refId && Array.isArray(objX?.kml?.Document?.Style)) {
      const st2 = objX.kml.Document.Style.find(o => o?.id === refId);
      if (st2?.IconStyle) styleObj = st2.IconStyle;
    }
  }

  // Icon URL -> local file path
  const rawIcon = styleObj?.Icon?.href?.["#text"] || "";
  const iconUrl = resolveKmlIconUrl(rawIcon);

  const markerId = "ti_" + mapOverlayId;

  // Tree node
  mother.children.push({
    text: place.name?.["#text"] || "(uden navn)",
    state: { opened: false, selected: false },
    id: markerId,
    kind: "point",
    Point: position,
    icon: iconUrl
  });

  const aMarker = createMarker({
    map,
    position,
    title: markerId,
    icon: iconUrl
  });

  // IMPORTANT: allow hover/dblclick logic to find the marker
  addedOverlays.push({ id: markerId, overlay: aMarker });

  aMarker.addListener("gmp-click", () => {
    closeAllInfoWindows();

    if (!tripInfoWindow) tripInfoWindow = new google.maps.InfoWindow();

    // Show placemark name (basic flyout)
    tripInfoWindow.setContent(place.name?.["#text"] || "");
    // Prefer anchoring to the marker (works for AdvancedMarkerElement)
    try {
      tripInfoWindow.open({ map, anchor: aMarker });
    } catch (_) {
      tripInfoWindow.setPosition(position);
      tripInfoWindow.open({ map });
    }

    // Sync selection to the trip tree
    selectTreeNode(markerId);
  });

  return; // <-- IMPORTANT: stop here for Point placemarks
}

/*
    // Marker: prefer AdvancedMarkerElement via createMarker() (local icon),
    
    const aMarker = createMarker({
      map,
      position,
      title: "ti_" + mapOverlayId,
      icon: iconUrl,
      // IMPORTANT: do NOT pass animation here, or createMarker will force classic Marker
    
    });

*/


  // ---------- POLYLINE ----------
  if (place.LineString && place.LineString.coordinates["#text"]) {
    let coords = [];

    if (place.LineString.coordinates["#text"]) {
      coords = place.LineString.coordinates["#text"].trim().split(" ").map(p => LatLnger(p));
      var trackBounds = new google.maps.LatLngBounds();
      coords.forEach(lala => trackBounds.extend(lala));
    }

    let styleObj = null;
    if (objX.kml.Document.Style.find(o => o.id === place.styleUrl["#text"].substring(1))) {
      styleObj = objX.kml.Document.Style.find(o => o.id === place.styleUrl["#text"].substring(1)).LineStyle;
    } else if (objX.kml.Document.StyleMap.find(o => o.id === place.styleUrl["#text"].substring(1))) {
      const styleMap = objX.kml.Document.StyleMap.find(o => o.id === place.styleUrl["#text"].substring(1));
      const styleRef = styleMap.Pair.find(s => s.key["#text"] === "normal").styleUrl["#text"];
      styleObj = objX.kml.Document.Style.find(o => o.id === styleRef.substring(1)).LineStyle;
    }

    const KMLcolor = (styleObj && styleObj.color) ? styleObj.color["#text"] : "00000000";

    const flightPath = new google.maps.Polyline({
      path: coords,
      geodesic: true,
      strokeColor: "#" + KMLcolor.substring(6, 8) + KMLcolor.substring(4, 6) + KMLcolor.substring(2, 4),
      strokeOpacity: parseInt(KMLcolor.substring(0, 2), 16) / 255,
      strokeWeight: (styleObj && styleObj.width) ? parseFloat(styleObj.width["#text"]) : 2,
      map: map,
    });

    mother.children.push({
      text: place.name?.["#text"] || "(uden navn)",
      state: { opened: false, selected: false },
      id: "ti_" + mapOverlayId,
      kind: "polyline",
      trackBoundsNE: trackBounds.getNorthEast(),
      trackBoundsSW: trackBounds.getSouthWest()
    });

    addedOverlays.push({ id: "ti_" + mapOverlayId, overlay: flightPath });
  }

  // ---------- POLYGON ----------
  if (place.Polygon && place.Polygon.outerBoundaryIs?.LinearRing?.coordinates?.["#text"]) {
    const coords = place.Polygon.outerBoundaryIs.LinearRing.coordinates["#text"]
      .trim()
      .split(" ")
      .map(p => LatLnger(p));

    const polyBounds = new google.maps.LatLngBounds();
    coords.forEach(ll => polyBounds.extend(ll));

    const polygon = new google.maps.Polygon({
      paths: coords,
      map: map,
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillOpacity: 0.2,
    });

    mother.children.push({
      text: place.name?.["#text"] || "(uden navn)",
      state: { opened: false, selected: false },
      id: "ti_" + mapOverlayId,
      kind: "polygon",
      trackBoundsNE: polyBounds.getNorthEast(),
      trackBoundsSW: polyBounds.getSouthWest()
    });

    addedOverlays.push({ id: "ti_" + mapOverlayId, overlay: polygon });
  }
}


function doFolder(fol,mother,doFolderDepth){
	//Handle a KML folder(fol), in context of a tree node (mother) - supply folder level/depth  (doFolderDepth)
	
	//Create a tree node, make place for children, assign the depth
	var aNode = {'text':fol.name['#text'],'kind':"container", 'state': {	'opened' :false,'selected' : false},'children':[],depth:doFolderDepth}
	
	//if supplied folder depth is greater than 	present folder depth, set the current 	depth to this value
	//if (doFolderDepth > folderDepth){folderDepth = doFolderDepth;}
	
	//push the current node into the context node
	mother.push(aNode);

	if (fol.Placemark){
		//if folder has placemark(s) submit these to doPlacemark along with reference to current node 
		if(Array.isArray(fol.Placemark)) {	
			$.each(fol.Placemark, function(i,place){doPlacemark(place,aNode)})
		}
		else{doPlacemark(fol.Placemark,aNode)}//doPlacemark(place,aNode)}//an object

	}
	if (fol.Folder){
		//if folder containg folders, send them to this function with reference to the children of current node and with folderdepth +1
		if(Array.isArray(fol.Folder)) {	
			$.each(fol.Folder, function(i,folMark){doFolder(folMark,aNode.children,doFolderDepth+1)})
		}
		else{doFolder(fol.Folder,aNode.children,doFolderDepth+1)}//an object
	}
}
/*subsection helpers for map-type pages*/


//return map div with map instance
function mapCreator()
{
  enterMapMode();
  hideMainToolbar();
	//create map div and append it
	var map_canvas = $("<div/>",{"id":"mapCanvas"}).css({"height":"100%"})
	$("<div/>",{"id":"mappage","data-role":"page", "class":"jqm-demos ui-page ui-page-theme-a ui-page-active mappage", "data-quicklinks":"true"})
	.appendTo($("body"))
	.append($('<div/>',{"class":"pagecontents","data-role":"content"})
		.css({"height":window.innerHeight})
		.append(map_canvas)
	)
	//Instantiate map
map = new google.maps.Map(document.getElementById('mapCanvas'), {
  center: { lat: 0, lng: 0 },
  zoom: 8,
  mapId: MAP_ID,
});
	  //create infovindow - the pop-up appearing when clicking a map marker
	  /*
      var infowindow = new google.maps.InfoWindow({
		content: "hello"
	  });
	
*/
		//create the app map toolbar
const mapToolbarDiv = document.createElement("div");
mapToolbarDiv.className = "app-map-toolbar";

addMapControl(mapToolbarDiv, map, "close");
addMapControl(mapToolbarDiv, map, "load");
addMapControl(mapToolbarDiv, map, "thumbs");

map.controls[google.maps.ControlPosition.TOP_LEFT].push(mapToolbarDiv);
	
return map; //to the calling function 
}


//helper function to provide lng/lat literal
function LatLnger(point){
	return	{'lng': Number(point.split(",")[0]), 'lat': Number(point.split(",")[1])}
	}

//Iteratively Calculate the bounds that would contain the features referred by a tree node and its children - and store them on the node
function calculateFolderBounds(treeData){
  // Compute bounds for EVERY node (folders, points, tracks) without creating "world-sized" bounds
  // when a folder is empty, and without relying on missing properties like child.trackBounds.
  // Tracks/polygons store literals in trackBoundsNE/SW; points store literal in Point.

  function toLiteral(ll){
    if (!ll) return null;
    // ll can be a google.maps.LatLng or a literal {lat,lng}
    if (typeof ll.lat === "function") return { lat: ll.lat(), lng: ll.lng() };
    if (typeof ll.lat === "number" && typeof ll.lng === "number") return { lat: ll.lat, lng: ll.lng };
    return null;
  }

  function boundsFromNode(node){
    let b = null;

    const ensure = () => { if (!b) b = new google.maps.LatLngBounds(); };

    const extendLiteral = (ll) => {
      const lit = toLiteral(ll);
      if (!lit || typeof lit.lat !== "number" || typeof lit.lng !== "number") return;
      ensure();
      b.extend(lit);
    };

    if (!node || !node.kind) return null;

    if (node.kind === "point"){
      extendLiteral(node.Point);
    } else if (node.kind === "polyline" || node.kind === "polygon"){
      extendLiteral(node.trackBoundsNE);
      extendLiteral(node.trackBoundsSW);
    } else if (node.kind === "container"){
      const kids = Array.isArray(node.children) ? node.children : [];
      kids.forEach((ch) => {
        const cb = boundsFromNode(ch);
        if (!cb) return;
        ensure();
        b.union(cb);
      });
    }

    // IMPORTANT: store bounds on every node, not just roots
    node.folderBounds = b || null;
    if (b){
      node.folderBoundsSW = toLiteral(b.getSouthWest());
      node.folderBoundsNE = toLiteral(b.getNorthEast());
    } else {
      node.folderBoundsSW = null;
      node.folderBoundsNE = null;
    }

    return b;
  }

  const roots = Array.isArray(treeData) ? treeData : [treeData];
  roots.forEach((n) => boundsFromNode(n));
}


// ---- Areas index (areas.geo.json) for loading images across datasets by map bounds ----
let areasIndexFc = null;
let areasIndexPromise = null;
const areaDatasetCache = new Map(); // areaId -> GeoJSON FeatureCollection

function _walkCoords(coords, cb) {
  if (!coords) return;
  if (typeof coords[0] === "number" && typeof coords[1] === "number") {
    cb(coords); // [lng, lat]
    return;
  }
  if (Array.isArray(coords)) coords.forEach((c) => _walkCoords(c, cb));
}

function _featureBbox(feature) {
  try {
    const g = feature?.geometry;
    if (!g) return null;

    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;

    _walkCoords(g.coordinates, ([lng, lat]) => {
      if (typeof lng !== "number" || typeof lat !== "number") return;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    });

    if (!isFinite(minLng) || !isFinite(minLat) || !isFinite(maxLng) || !isFinite(maxLat)) return null;
    return { minLng, minLat, maxLng, maxLat };
  } catch (_) {
    return null;
  }
}

function _boundsToBbox(bounds) {
  if (!bounds) return null;
  const ne = bounds.getNorthEast?.();
  const sw = bounds.getSouthWest?.();
  if (!ne || !sw) return null;
  return {
    minLng: sw.lng(),
    minLat: sw.lat(),
    maxLng: ne.lng(),
    maxLat: ne.lat(),
  };
}

function _bboxIntersects(a, b) {
  if (!a || !b) return false;
  return !(a.maxLng < b.minLng || a.minLng > b.maxLng || a.maxLat < b.minLat || a.minLat > b.maxLat);
}

function ensureAreasIndex() {
  if (areasIndexFc) return Promise.resolve(areasIndexFc);
  if (areasIndexPromise) return areasIndexPromise;

  // areas.geo.json lives at site root (same level as index.htm)
  areasIndexPromise = $.getJSON("areas.geo.json")
    .then((fc) => {
      areasIndexFc = fc || { type: "FeatureCollection", features: [] };
      (areasIndexFc.features || []).forEach((f) => {
        if (!f.__bbox) f.__bbox = _featureBbox(f);
      });
      return areasIndexFc;
    })
    .catch((e) => {
      console.warn("Could not load areas.geo.json (falling back to currentDataset only).", e);
      areasIndexFc = { type: "FeatureCollection", features: [] };
      return areasIndexFc;
    });

  return areasIndexPromise;
}

function loadAreaDataset(areaId) {
  if (!areaId) return Promise.resolve(null);
  if (areaDatasetCache.has(areaId)) return Promise.resolve(areaDatasetCache.get(areaId));

  const url = `data/sted/${areaId}.geo.json`;

  return $.getJSON(url)
    .then((fc) => {
      areaDatasetCache.set(areaId, fc);
      return fc;
    })
    .catch((e) => {
      console.warn("Could not load area dataset:", url, e);
      areaDatasetCache.set(areaId, null);
      return null;
    });
}

// Returns a GeoJSON FeatureCollection with ALL images (from relevant area datasets) inside map bounds.
// If areas.geo.json isn't available or no areas intersect, returns null so caller can fall back.
async function loadImagesInBoundsFromAreas(bounds) {
  const bb = _boundsToBbox(bounds);
  if (!bb) return null;

  const areas = await ensureAreasIndex();
  const hits = [];

  (areas?.features || []).forEach((f) => {
    const areaId = String(f?.id ?? f?.properties?.id ?? "").trim();
    if (!areaId) return;

    const fb = f.__bbox || _featureBbox(f);
    if (!fb) return;

    if (_bboxIntersects(bb, fb)) hits.push(areaId);
  });

  const uniqueIds = Array.from(new Set(hits));
  if (!uniqueIds.length) return null;

  const datasets = await Promise.all(uniqueIds.map(loadAreaDataset));

  const out = [];
  datasets.forEach((ds) => {
    (ds?.features || []).forEach((f) => {
      const lat = f?.geometry?.coordinates?.[1];
      const lng = f?.geometry?.coordinates?.[0];
      if (typeof lat !== "number" || typeof lng !== "number") return;
      if (bounds.contains(new google.maps.LatLng(lat, lng))) out.push(f);
    });
  });

  // Deduplicate (areas can overlap/nest). Prefer stable key: image path, else index, else coord string.
  const seen = new Set();
  const dedup = [];
  out.forEach((f) => {
    const key =
      f?.properties?.image ??
      f?.properties?.index ??
      JSON.stringify(f?.geometry?.coordinates ?? []);
    if (seen.has(key)) return;
    seen.add(key);
    dedup.push(f);
  });

  return { type: "FeatureCollection", features: dedup };
}


function addMapControl(controlDiv, map, mapDoWhat) {
  const controlUI = document.createElement("button");
controlUI.type = "button";
controlUI.className = "app-map-control app-map-control-" + mapDoWhat;
controlDiv.appendChild(controlUI);

const controlIcon = document.createElement("span");
controlIcon.className = "app-map-control-icon";
controlUI.appendChild(controlIcon);

const controlText = document.createElement("span");
controlText.className = "app-map-control-text";
controlUI.appendChild(controlText);

  function boundsContainsPoint(bounds, geom) {
    if (!bounds || !geom) return false;
    // We only care about Point markers here
    if (geom.getType && geom.getType() !== "Point") return false;
    const ll = geom.get(); // google.maps.LatLng
    return bounds.contains(ll);
  }

  function currentMapBounds() {
    // getBounds() is enough; your code used getBounds(true) but the signature is getBounds()
    return map.getBounds();
  }

  switch (mapDoWhat) {
    case "close":
      controlIcon.textContent = "×";
      controlText.textContent = "Luk kort";
      controlUI.title = "Luk kort";
      controlUI.addEventListener("click", () => {
        $(".mappage").remove();
        exitMapMode();
        hideMainToolbar();
        window.location.href = "#initial";
        setTimeout(function () { window.scrollBy(0, thumbPageScroll); }, 200);
      });
      break;

    case "load":
      // “Load all images within map bounds”
      // 1) Try to find intersecting area datasets via areas.geo.json (Sted datasets)
      // 2) Load those datasets + filter points inside bounds
      // 3) Deduplicate (areas can overlap) and show with AdvancedMarkers
      controlIcon.textContent = "●";
      controlText.textContent = "Vis billeder";
      controlUI.title = "Vis alle geotaggede billeder i det viste område";
      controlUI.addEventListener("click", async () => {
        const b = currentMapBounds();
        if (!b) return;

        let fc = await loadImagesInBoundsFromAreas(b);

        // Fallback: just use currentDataset if areas-index isn't available or didn't hit anything
        if (!fc) {
          const src = currentDataset;
          if (!src || !src.features) return;

          const featuresInBounds = src.features.filter(f => {
            const lat = f?.geometry?.coordinates?.[1];
            const lon = f?.geometry?.coordinates?.[0];
            if (typeof lat !== "number" || typeof lon !== "number") return false;
            return b.contains(new google.maps.LatLng(lat, lon));
          });

          fc = { type: "FeatureCollection", features: featuresInBounds };
        }

        // Only geotagged photos can be shown as markers
        const geo = getGeotaggedFeatures(fc);

        if (!geo.features || !geo.features.length) {
          alert("Ingen geotaggede billeder i dette område.");
          return;
        }

        // Add/replace photo markers on the current map (AdvancedMarkers + clickable thumb InfoWindow)
        await showTripPhotosOnMap(geo, { fit: true });
      });
      break;

    case "thumbs":
      // “Show the markers currently visible on the map in the thumb-page”
    

  
  controlIcon.textContent = "▦";
  controlText.textContent = "Se liste";
  controlUI.title = "Se alle billeder fra det viste område som liste";      

  controlUI.addEventListener("click", function () {

    if (!map || !photoMarkers || !photoMarkers.length) return;

    const bounds = map.getBounds();
    if (!bounds) return;

    const visibleFeatures = [];

    photoMarkers.forEach(m => {
      if (!m.__feature) return;

      const pos = markerLatLng(m);
      if (!pos) return;

      if (bounds.contains(new google.maps.LatLng(pos.lat, pos.lng))) {
        visibleFeatures.push(m.__feature);
      }
    });

    if (!visibleFeatures.length) {
      alert("Ingen billeder i det viste kortområde.");
      return;
    }

    $(".mappage").remove();
    hideMainToolbar();
    exitMapMode();

    setCurrentDataset({
      type: "FeatureCollection",
      features: visibleFeatures
    });

    buildTiles(currentDataset);

    window.location.href = "#initial";
  });

  break;

    case "trippics":
      controlIcon.textContent = "📷";
      controlText.textContent = "Turbilleder";
      controlUI.title = "Vis billeder for denne tur";
      controlUI.classList.add("trippix");
      controlUI.addEventListener("click", async () => {
        const startDate = new Date(tripPixDates.startDate);
        const endDate = new Date(tripPixDates.endDate);

        const src = currentDataset || theDataset;
        if (!src || !src.features) return;

        const filtered = src.features.filter(f => {
          const ts = f?.properties?.timestamp;
          if (!ts) return false;
          const d = new Date(ts);
          return d >= startDate && d <= endDate;
        });

        // Only geotagged photos can be shown as markers
        const fc = getGeotaggedFeatures({ type: "FeatureCollection", features: filtered });

        if (!fc.features || !fc.features.length) {
          alert("Ingen geotaggede billeder i denne tur.");
          return;
        }

        // Add/replace photo markers on the existing trip map (AdvancedMarkers + clickable thumb InfoWindow)
        await showTripPhotosOnMap(fc, { fit: true });
      });
      break;

    case "tagger":
      controlIcon.textContent = "✚";
      controlText.textContent = "Geotag";
      controlUI.title = "Åbn geotagging";
      controlUI.addEventListener("click", () => { taggerInterface(); });
      break;

    default:
      break;
  }
}

  //Create the geotagging interface
function taggerInterface(aDate){
	//Setup the drawingManager to handle placements of images on map
	//const drawingManager = new google.maps.drawing.DrawingManager({
// Geotagger placement now uses MAP CLICK (not DrawingManager)
syncGeotagClickPlacementMode();





//add buttons, datepickers and resultfield
$("#sidepanel").append($("<div/>",{"id":"taggerbox"}).css({"height":"80%","width":"100%"})
	//.append($("<label/>",{"for":"choosefrom"}).text("fra"))
	.append($("<label/>",{"text":"skjul popup","data-role":"none"}).append($("<input/>",{"type":"checkbox","id":"hidePreview","name":"hidePreview","value":"hidePreview","data-role":"none"})))
	
	.append($("<input/>",{"type":"datetime-local","id":"choosefrom","name":"choosefrom","value":aDate?aDate + "T00:00":"2022-07-28T00:00","min":"2000-01-01T00:00","max":"2022-12-31T23:59","data-role":"none"}))
	//.append($("<label/>",{"for":"chooseuntil"}).text("til"))
	.append($("<input/>",{"type":"datetime-local","id":"chooseuntil","name":"chooseuntil","value":aDate?aDate + "T23:30":"2022-07-28T23:30","min":"2000-01-01T00:00","max":"2022-12-31T23:59","data-role":"none"}))
	.append($("<label/>",{"text":"show geocoded","data-role":"none"}).append($("<input/>",{"type":"checkbox","id":"showGeotagged","name":"showGeotagged","value":"showGeotagged","data-role":"none"})))
	//the search-button - fills the resultfield
	.append($("<input/>",{"type":"button","id":"doSearch","name":"doSearch","value":"Find","data-role":"none"})
		.on("click", function( event ) { 
			$("#choosebox").empty();
			var startDate = new Date($('#choosefrom').val());
			var endDate = new Date($('#chooseuntil').val());
			currentDataset.features.filter(f => {//toggle ikke-geotaggede
				var date = new Date(f.properties.timestamp);
				var allowWithGeometry = (!f.geometry || $("#showGeotagged")[0].checked)?true:false
				return (date >= startDate && date <= endDate && allowWithGeometry);
				})
				.forEach(fe => //add the individual thumbs
					{var jumper
						newThumb = $("<figure/>").css({"margin":"5px"})
						.append($("<img/>",{
							"class":fe.geometry?"choose originalGeometry":"choose",
							"src":fe.properties.image.substring(0,fe.properties.image.lastIndexOf('/')) + "/.thumb/" + fe.properties.image.substring(fe.properties.image.lastIndexOf('/') +1) + ".jpg" ,
							//"max-height":"50px",
							"data-index":fe.properties.index,
							"data-image":fe.properties.image,
							"data-camera":fe.properties.camera,
							"data-timestamp":fe.properties.timestamp
							})
							.css({"max-width":"80px"})
							.mouseover(function(event){
								$("#mappage").append($("<img/>",{"src":event.target.src,"class":"floatingImage"}).css({ "top": "200px",	"z-index": "2000","position":"absolute","left":"200px",}))
								 jumper = addedMarkers.find(m => m.properties.index === event.target.dataset.index)
							
							if (jumper && jumper.marker) {
                                 setMarkerBounce(jumper.marker, true);
                            }

							
											
							
							
							})
							.mouseout(function(){
								$(".floatingImage").remove();
								if (jumper && jumper.marker) {
                                     setMarkerBounce(jumper.marker, false);
                                }
								})
							.click(function(event){
								
								if ($(event.target).hasClass("chosen")){
									$(event.target).removeClass("chosen")
								}
								else
								{
									$(event.target).addClass("chosen")
								}
								if ($(event.target).hasClass("placed")){
									$(event.target).removeClass("placed")
									$(event.target).removeClass("chosen")
									addedMarkers.forEach(f => {
									if (f.properties.index === event.target.dataset.index)
										{
										f.marker.map = null;
										addedMarkers.splice(addedMarkers.indexOf(f),1)
										}
									})
									makeTextFile(addedMarkers);
									
								}
								syncGeotagClickPlacementMode();
									
							})
						)
						.append($("<figcaption/>").text(fe.properties.index + " - " + new Intl.DateTimeFormat('da-DK',{ dateStyle: 'medium',timeStyle: 'short'}).format(new Date(fe.properties.timestamp))))
						
					.appendTo($("#choosebox"))
					if (fe.geometry)
					{imageToMap(newThumb[0].children[0],{lat:Number(fe.geometry.coordinates[1]),lng:Number(fe.geometry.coordinates[0])},false)}		
	
						})


							
		})
		
	)
	
	//add download link
	//.append($("<a/>",{"id":"downloadlink","download":"commands.bat"}).text("dl").css({"display":"none"}))
	.append($("<a/>",{"id":"downloadLink","download":"commands.ps1"}).text("dl").css({"display":"none"}))
	.append($("<input/>",{"type":"button","id":"downloadButton","val":"Download geocode","data-role":"none"}).css({"display":"none"})
	.on("click", function(event){
		document.getElementById("downloadLink").click()
		//remove all placed, update addedmarkers, remove from map, make new commandfile, skjul dl link
		$("#choosebox > figure > .placed").each( function(index)
		{
			$(this.parentElement).remove();
			addedMarkers.forEach(f => {
			if (f.properties.index === this.dataset.index)
				{
				f.marker.marker = null;
				addedMarkers.splice(addedMarkers.indexOf(f),1)
				}
			})
		}
		)
		makeTextFile(addedMarkers);
		$("#downloadButton").css({"display":"none"})
	}))
	
	.append($("<br/>"))
	//add select all button
	.append($("<input/>",{"type":"button","id":"selectAll","name":"selectAll","value":"Alt","data-role":"none"})
		.on("click", function( event ) {//on  click, put class 'chosen' on all
			Array.from(document.getElementsByClassName('choose')).forEach(i => $(i).addClass("chosen"))
			//initiate the drawingmanager
			syncGeotagClickPlacementMode();	
		 }))
		 //add deselect button
	.append($("<input/>",{"type":"button","id":"selectNone","name":"selectNone","value":"Intet","data-role":"none"})
		.on("click", function( event ) { //remove the 'chosen' class
			Array.from(document.getElementsByClassName('chosen')).forEach(i => $(i).removeClass("chosen"))
			syncGeotagClickPlacementMode();	
		}))


	.append($("<select/>",{id:"pointSelect","data-native-menu":"true", "data-mini":"true","data-role":"none"})//build dropdown
		.append($("<option/>",{text:"Vælg et sted"})) 
		.on( "change", function( event ) { //On selection 
			
			$(".chosen").each(function(number,chosenImage){imageToMap(chosenImage,{lat:Number(event.target.value.split(",")[0]),lng:Number(event.target.value.split(",")[1])},true)})
			makeTextFile(addedMarkers);
			syncGeotagClickPlacementMode();
		event.target.selectedIndex = -1;
		})
	)
	 //The box with the thumbs
	.append($("<div/>",{"id":"choosebox"}).css({"border":"solid","height":"100%","width":"95%","display":"flex","flex-flow": "row wrap","overflow":"scroll"}))
)


//get values for the point select
  	$.getJSON("places.geo.json", function(places) {
		places.features.forEach(feature => 
			$("#pointSelect").append( $("<option/>",{text:feature.properties.placeName,value:feature.geometry.coordinates[1] + "," + feature.geometry.coordinates[0]})
			)
		)
		
	})
	if (aDate){	document.getElementById("showGeotagged").click()}
	if (aDate){	document.getElementById("doSearch").click()	}



var addedBounds = new google.maps.LatLngBounds();
if (addedMarkers.length > 0){
for (var i = 0; i < addedMarkers.length; i++) {
	addedBounds.extend({
        lat:addedMarkers[i].geometry.coordinates[1],
        lng:addedMarkers[i].geometry.coordinates[0]
    });
}


}
else{
	addedBounds.extend({lng:8.08997684086,lat:54.8000145534});
	addedBounds.extend({lng: 12.6900061378,lat:57.730016588});

	//'DK': ('Denmark', (8.08997684086, 54.8000145534, 12.6900061378, 57.730016588)),
    
}
map.fitBounds(addedBounds);

	}
	


	function imageToMap(chosenImage,position,newGeo){
		//make class 'placed'
		$(chosenImage).addClass("placed").removeClass("chosen")
		//Make an icon to use as a marker
		theIcon = {
			url: chosenImage.src,
			// This marker is 40 pixels wide by 60 pixels high or the other way around
			scaledSize: (chosenImage.width > chosenImage.height)?new google.maps.Size(60,40):new google.maps.Size(40,60),
			// The origin for this image is (0, 0).
			origin: new google.maps.Point(0, 0),
			// The anchor for this image is at the bottom left corner.
			anchor: (chosenImage.width > chosenImage.height)? new google.maps.Point(0, 40):new google.maps.Point(0, 60),
		};
		//Make marker with the thumbnail image - put it where the drawingManager left its marker

		const putMarker = createMarker({
  map,
  position,
  title: "Lige her!",
  icon: theIcon,
  cssClass: "geotag",
  animateDrop: true,
  draggable: true,
});
putMarker.customMarkerIndex = chosenImage.dataset.index;

/*
		const putMarker = createMarker({
  map,
  position,
  title: "Lige her!",
  icon: theIcon,
  draggable: true, // forces classic Marker, so drag works
});
putMarker.customMarkerIndex = chosenImage.dataset.index;

*/
		  //console.log(putMarker.position.lat(),putMarker.position.lng())
		//add a reference to  marker to the addedMarkers array - as a feature
        const ll0 = markerLatLng(putMarker);
		  addedMarkers.push(
			{
				type:"Feature",
				properties:{
					index:chosenImage.dataset.index,
					image:chosenImage.dataset.image,
					camera:chosenImage.dataset.camera,
					timestamp:chosenImage.dataset.timestamp,
					newGeo:newGeo
				},
				
                geometry: { "type": "Point", "coordinates": [ ll0.lng, ll0.lat ] },
				marker: putMarker
				
			}
		)
		//add listener - if marker is moved, update the corresponding marker in addedMarkers - add the newGeo tag
       
		putMarker.addListener("dragend", () => {
             const ll1 = markerLatLng(putMarker);
			addedMarkers.forEach(function (m){ 
				if (m.properties.index === putMarker.customMarkerIndex)
				{m.geometry.coordinates = [	ll1.lng, ll1.lat ];
				m.properties.newGeo = true;
				}}
			)
			//write the array of markers to the poweshell textfile
			makeTextFile(addedMarkers);
			//console.log(putMarker.position.lat(),putMarker.position.lng(),addedMarkers.find(m => m.properties.index === putMarker.customMarkerIndex).geometry.coordinates)
			});
			//if marker is right-clicked - remove it from addedMarkers, from the map and revert the box-thumb back to not-placed
		putMarker.content.addEventListener("contextmenu", (e) => {
            e.preventDefault();

            const dex = putMarker.customMarkerIndex;

            const removeThis = addedMarkers.findIndex(f => f.properties.index === dex);
            if (removeThis >= 0) addedMarkers.splice(removeThis, 1);

            // remove marker from map
            putMarker.map = null;

            // revert thumbnail back to not-placed (keep your existing logic)
            $(".placed").each(function(x,i){
                if (i.dataset.index === dex) { $(i).removeClass("placed"); }
            });

            makeTextFile(addedMarkers);
            });



		//when mouse is over the marker - show larger image
		putMarker.content.addEventListener("mouseover",function(){
			if(! $("#hidePreview")[0].checked){
			$("#mappage").append($("<img/>",{"src":putMarker.icon.url,"class":"floatingImage"}).css({ "top": "200px",	"z-index": "2000","position":"absolute","left":"200px",}))
				}
			})
			putMarker.content.addEventListener("mouseout",function(){
			$(".floatingImage").remove()
			})
	
	}
	function makeTextFile (addedMarkers) {
		var exifLines = "";
		var jsonLines = "";
		
			addedMarkers.filter(m => m.properties.newGeo).forEach(m => {
				var imagePath =  m.properties.image.substring(3)
				var imageFolder = imagePath.substring(0,imagePath.lastIndexOf("/") + 1)
				var imageName = imagePath.substring(imagePath.lastIndexOf("/") + 1)
				var imageBase = imageName.substring(0,imageName.lastIndexOf("."))
				exifLines = exifLines 
					+ "Start-Process -NoNewWindow -FilePath "
					+ fileSystemPaths.exiftoolPath
					+ " -ArgumentList \"-overwrite_original" 
					+ " -GPSLatitude=" + m.geometry.coordinates[0] 
					+ " -GPSLatitudeRef=" + m.geometry.coordinates[0] 
					+ " -GPSLongitude=" + m.geometry.coordinates[1] 
					+ " -GPSLongitudeRef=" + m.geometry.coordinates[1] 
					+ "  `\"" + fileSystemPaths.imageBasePath + imagePath + "`\""
					+ " `\"" + fileSystemPaths.imageBasePath + imageFolder + "Originaler/" + imageBase + ".NEF`\""
					+ "\"\r\n"
				jsonLines = jsonLines 
					+  "\"" + m.properties.image + "\""
					+ " {Add-member -Force -InputObject $feature -Name \"geometry\" -value (ConvertFrom-Json \"{type:'Point', coordinates: [" 
					+ m.geometry.coordinates[1]
					+ ","
					+ m.geometry.coordinates[0]
					+ "]}\") -MemberType NoteProperty;break}\r\n"
			})
			var consoleCommand = exifLines 
			+ "$json = Get-Content  -Encoding UTF8 \"" + fileSystemPaths.imageDataPath + "\" -raw | ConvertFrom-Json \r\n"
			//+ "$json = Get-Content \"Z:\\Foto\\VoresBilleder\\images.geo.json\" -raw | ConvertFrom-Json \r\n"
				+ "foreach ($feature in $json.features) \r\n"
				+ "{\r\n"
				+ "switch ($feature.properties.image) { \r\n"
				+ jsonLines
				+ "Default {}\r\n}}\r\n"
				+ "$json | ConvertTo-Json -depth 32 -Compress| set-content -Encoding UTF8 \"" + fileSystemPaths.imageDataPath + "\"\r\n"
				//+ "$json | ConvertTo-Json -depth 32 -Compress| set-content \"z:\\Foto\\VoresBilleder\\images.geo.json\"\r\n"
				+ "Read-Host -Prompt \"Press Enter to exit\""
				 
	

		//exiftool -GPSLatitude=70.68833887786599 -GPSLatitudeRef=70.68833887786599 -GPSLongitude=-52.10783369649505 -GPSLongitudeRef=-52.10783369649505 FileOrDir
		//						.append($("<td/>",{title:"kopier sti"}).html("&#128449;").on("click",function(){setClipboard("Z:\\Foto" + info.image.split("Foto")[1].substring(0,info.image.split("Foto")[1].lastIndexOf('/') +1).split("/").join("\\"))}).css("cursor","pointer"))
		//display the download link
		$('#downloadButton').css({"display":"inline"})
		//display the clear button
		//$('#clearmap').css({"display":"inline"})
		//create from addedmarkers
		var data = new Blob(["\ufeff" + consoleCommand], {type: 'text/plain'});
		//var data = new Blob([consoleCommand], {type: 'text/plain'});
	
		// If we are replacing a previously generated file we need to
		// manually revoke the object URL to avoid memory leaks.
		if (textFile !== null) {
		  window.URL.revokeObjectURL(textFile);
		}
	
		textFile = window.URL.createObjectURL(data);
		
		var link = document.getElementById('downloadLink');
		link.href = textFile;
		console.log(consoleCommand)
	  };
	
/*
¤¤¤SECTION data HELPERS¤¤¤
*/
//return featureCollection with geotagged images from submitted featureCollection
//Using underscore - could probably be replaced
function getGeotaggedFeatures(inputData) {
  // Return only features with geometry (geotagged) from submitted FeatureCollection
  const feats = (inputData && Array.isArray(inputData.features)) ? inputData.features : [];
  return { type: "FeatureCollection", features: feats.filter(f => f && f.geometry) };
}


//help transforming xml data to Javascript object
function parseXml(xml, arrayTags) {//arrayTags seem not to be in use
    let dom = null;
    if (window.DOMParser) dom = (new DOMParser()).parseFromString(xml, "text/xml");
    else if (window.ActiveXObject) {
        dom = new ActiveXObject('Microsoft.XMLDOM');
        dom.async = false;
        if (!dom.loadXML(xml)) throw dom.parseError.reason + " " + dom.parseError.srcText;
    }
    else throw new Error("cannot parse xml string!");

    function parseNode(xmlNode, result) {
        if (xmlNode.nodeName == "#text") {
            let v = xmlNode.nodeValue;
            if (v.trim()) result['#text'] = v;
            return;
        }

        let jsonNode = {},
            existing = result[xmlNode.nodeName];
        if (existing) {
            if (!Array.isArray(existing)) result[xmlNode.nodeName] = [existing, jsonNode];
            else result[xmlNode.nodeName].push(jsonNode);
        }
        else {
            if (arrayTags && arrayTags.indexOf(xmlNode.nodeName) != -1) result[xmlNode.nodeName] = [jsonNode];
            else result[xmlNode.nodeName] = jsonNode;
        }

        if (xmlNode.attributes) for (let attribute of xmlNode.attributes) jsonNode[attribute.nodeName] = attribute.nodeValue;

        for (let node of xmlNode.childNodes) parseNode(node, jsonNode);
    }

    let result = {};
    for (let node of dom.childNodes) parseNode(node, result);

    return result;
}

//return objects from object based on key-value filter
function getObjects(obj, key, val) {
    var objects = [];
    for (var i in obj) {
        if (!obj.hasOwnProperty(i)) continue;
        if (typeof obj[i] == 'object') {
            objects = objects.concat(getObjects(obj[i], key, val));    
        } else 
        //if key matches and value matches or if key matches and value is not passed (eliminating the case where key matches but passed value does not)
        if (i == key && obj[i] == val || i == key && val == '') { //
            objects.push(obj);
        } else if (obj[i] == val && key == ''){
            //only add if the object is not already in the array
            if (objects.lastIndexOf(obj) == -1){
                objects.push(obj);
            }
        }
    }
    return objects;
}

/* ===== v8 navigation behaviour ===== */

function collapseToolbar(){
  document.querySelector(".app-nav")?.classList.add("nav-collapsed");
}

function expandToolbar(){
  document.querySelector(".app-nav")?.classList.remove("nav-collapsed");
}

document.addEventListener("click", function(e){
  if(e.target && e.target.id === "navShowFull"){
    expandToolbar();
  }
});

function cloneStack(stack){
  return (stack || []).map(item => ({ label: item.label, node: item.node }));
}

function saveCurrentNavState(){
  navState.savedStacks = navState.savedStacks || { tid: [], sted: [], anvendelse: [] };
  if (navState.currentRoot) {
    navState.savedStacks[navState.currentRoot] = cloneStack(navState.stack);
  }
}

function selectAndApply(selection){
  navState.pendingSelection = selection;
  navState.activeSelection = selection;

  if (navState.currentRoot === "tid") {
    navState.savedStacks = navState.savedStacks || { tid: [], sted: [], anvendelse: [] };
    navState.savedStacks.tid = cloneStack(navState.stack);
  } else if (navState.currentRoot === "sted") {
    navState.savedStacks = navState.savedStacks || { tid: [], sted: [], anvendelse: [] };
    navState.savedStacks.sted = [];
  } else if (navState.currentRoot === "anvendelse") {
    navState.savedStacks = navState.savedStacks || { tid: [], sted: [], anvendelse: [] };
    navState.savedStacks.anvendelse = cloneStack(navState.stack);
  }

  updateSelectionLabel();

  const collapsedSelection = document.getElementById("collapsedSelection");
  if (collapsedSelection) collapsedSelection.textContent = selection.label;

  closeNavDrawer();

  if (isListMode()) collapseToolbar();
  else expandToolbar();

  selection.action();
}

function resetCurrentSelection() {
  navState.pendingSelection = null;
  navState.activeSelection = null;
  navState.stack = [];
  navState.savedStacks = { tid: [], sted: [], anvendelse: [] };
  updateSelectionLabel();
  const collapsedSelection = document.getElementById("collapsedSelection");
  if (collapsedSelection) collapsedSelection.textContent = "Vælg Tid, Sted eller Anvendelse";
  closeNavDrawer();
  expandToolbar();
  $(".toolbar-btn[data-nav-root]").removeClass("is-active");
  showMainToolbar();
  restoreHomeSplash();
}
