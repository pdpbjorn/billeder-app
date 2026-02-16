/*Ø SECTION Global variables*/
	//var theDataset; //Global variable storing the data loaded from geojson
	//var theAreas; //a set of geograpical areas (countries) for cookie cutting - loaded from JSON file
	//var theTrips; //a list with descriptions of the trips available as KML - loaded from JSON file
	let map; //global variable storing the Google Maps map
	const MAP_ID = "c4befeb907ef4d6a4789e14c";
	var slideShowOn; //boolean variable which know if the image slideshow is running
	var thumbPageScroll; //variable storing the vertical scroll position of the thumbnail page before some other page was loaded - useful for restoring scroll position
	var objX; //Global object storing the JSON version of the trip loaded from the KML file	
	var currentImageIndex; //Global variable storing the Global index number of the image currently displayed
	var mapOverlayId = 0; //Globally incrementing counter enumerating all features items liaded to the map
	var folderDepth = 1; //Globally incrementing counter enumerating the relative nestedness of the folders in the JSTree structure
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
  return `icons/${filename}`;
}
function markerLatLng(m) {
  const p = m.position;
  if (!p) return null;
  if (typeof p.lat === "function") return { lat: p.lat(), lng: p.lng() };
  return { lat: p.lat, lng: p.lng };
}
// Create a marker using AdvancedMarkerElement,

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

  // Wrapper element that we can style with CSS
  const wrapper = document.createElement("div");
  wrapper.className = `am-marker ${cssClass}`.trim();

  const iconUrl = (typeof icon === "string") ? icon : (icon && icon.url ? icon.url : null);

  if (iconUrl) {
    const img = document.createElement("img");
    img.src = iconUrl;
    img.alt = title;
    img.className = "am-marker-img";
    wrapper.appendChild(img);
  } else {
    const dot = document.createElement("div");
    dot.className = "am-marker-dot";
    wrapper.appendChild(dot);
  }

  if (animateDrop) wrapper.classList.add("am-drop");

  const m = new AdvancedMarkerElement({
    map,
    position,
    title,
    content: wrapper
  });

  // Make it clickable + draggable
  m.gmpClickable = true;               // click support
  m.gmpDraggable = !!draggable;        // draggable support

  if (animateDrop) {
    wrapper.addEventListener("animationend", () => wrapper.classList.remove("am-drop"), { once: true });
  }

  return m;
}

// CSS-bounce for AdvancedMarkerElement
function setMarkerBounce(marker, on) {
  if (!marker || !marker.content) return;
  marker.content.classList.toggle("am-bounce", !!on);
}

/*Ø SECTION General behavior*/	
/*Ø SECTION General behavior*/	
/*Ø SECTION General behavior*/	
/*Ø SECTION General behavior*/	
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
						if (document.getElementsByClassName("trippix").length > 0) //If the imagepage was opened from a map thumb, go to mappage, if not goto thumbpage
									{window.location.href = "#mappage"}
									else
									{window.location.href = "#initial"
									setTimeout(function(){window.scrollBy(0,thumbPageScroll);},200)}
					break;
					case 'ArrowRight'://if 'right arrow' browse to higher image index
						bladr(true)
					break;
					case 'ArrowLeft': //if 'left arrow' browse to lower image index
						bladr(false)
					break;
					default:
				}
			}
			if ($(".mappage").length > 0) //if the Map page is open
			{   
				switch(e.key) {
					case 'Escape': //if 'escape then close map and go to thumbpage
						$(".mappage").remove();
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
			WWW =  $( window ).width() + "px"
			HHH =  $( window ).height() + "px"
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



/* SECTION main setup of environment */
/* SECTION main setup of environment */
/* SECTION main setup of environment */
/* SECTION main setup of environment */
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



  $('#totalcount').html("—");
$('#datedcount').html("—");
$('#gtcount').html("—");
}




//fill areas dropdown - enable actions on select

function makeAreaLinksFromIndex(stedIndex){
  $('#dropPlace').empty();

  stedIndex.forEach(a => {
    // Optionally show count:
     //const label = ${a.name} (${a.count});
    const label = a.name + " (" + a.count + ")";

    $('#dropPlace').append(
      $("<li/>").append(
        $("<a/>", {
          onclick: "injectArea('" + a.id + "')",
          html: label,
          href: "#"
        })
      )
    );
  });
}

//fill trip dropdown - enable actions on select




function makeTripLinksFromIndex(anvIndex){

  $("#dropTrips").empty(); // prevent duplicates on reload

  anvIndex.groups.forEach(group => {

    // NEW: group.group instead of group.title
    var Gruppe = $("<li/>",{"class":"dropdown"})
      .append($("<a/>",{html:group.group,href:"#"}))
      .appendTo("#dropTrips");

    var GruppeTureListe = $("<ul/>").appendTo(Gruppe);

    group.trips.forEach(trip => {

      $("<li/>")
        .append($("<a/>",{
          href:"#",
          html: trip.title,   // still correct
		  title: trip.comment,
          onclick:
            "injectTrip('" +
			trip.id + "','" +
            trip.filename + "','" +
            trip.startDate + "','" +
            trip.endDate + "')"
        }))
        .appendTo(GruppeTureListe);

    });

  });
}



function makeMonthLinksFromIndex(tidIndex){
  $("#dropMonths").empty();

  tidIndex.decades.forEach(dec => {
    var decLi = $("<li/>", {"class":"dropdown"})
      .append($("<a/>", { html: dec.id, href:"#"}))
      .appendTo("#dropMonths");

    var yearsUl = $("<ul/>").appendTo(decLi);

    dec.years.forEach(yr => {
      var yrLi = $("<li/>", {"class":"dropdown"})
        .append($("<a/>", { html: yr.id, href:"#"}))
        .appendTo(yearsUl);

      var monthsUl = $("<ul/>").appendTo(yrLi);

      yr.months.forEach(m => {
        const label = m.id; // or: `${m.id} (${m.count})`

        $("<li/>")
          .append($("<a/>", {
            href:"#",
            html: label,
            onclick: "injectMonth('" + m.id + "')"
          }))
          .appendTo(monthsUl);
      });
    });
  });

  // Optional: add "no timestamp" entry at bottom of Tid:
  $("#dropMonths").append(
    $("<li/>").append(
      $("<a/>", { href:"#", html:"(no timestamp)", onclick:"injectNoDate()" })
    )
  );
}


//fill months dropdown - enable action on select to load thumbs from the month

function makeMonthLinks(theDataset){
	
	/*not needed ithink
	var maaneder = [{"name":"Januar","number":"01"},
	{"name":"Februar","number":"02"},
	{"name":"Marts","number":"03"},
	{"name":"April","number":"04"},
	{"name":"Maj","number":"05"},
	{"name":"Juni","number":"06"},
	{"name":"Juli","number":"07"},
	{"name":"August","number":"08"},
	{"name":"September","number":"09"},
	{"name":"Oktober","number":"10"},
	{"name":"November","number":"11"},
	{"name":"December","number":"12"}]
*/


	



		//Make new month menu

		$('#dropMonths').append($("<li/>").append($("<a/>",{onclick:"injectNoDate()",html:"udenfor tiden" ,href:"#"})))

		
		$.each( _.groupBy(currentDataset.features //for each decade group of images
		,
				function(feature){if(feature.properties.timestamp){return feature.properties.timestamp.substring(0,3)}}
				)
		,function(decadeLiteral,decade){
			if (decadeLiteral != "undefined"){
				var decadeGroup = $("<li/>",{"class":"dropdown"})
					.append($("<a/>",{html:decadeLiteral + "_",href:"#"})
						)
					.appendTo("#dropMonths") //add a decade grouper
					var yearList = ($("<ul/>")).appendTo(decadeGroup) 
				
				$.each( _.groupBy(decade //for each year group of images
		,
					function(feature){if(feature.properties.timestamp){return feature.properties.timestamp.substring(0,4)}}
				)
		,function(yearLiteral,annus){
			if (yearLiteral != "undefined"){
				var yearGroup = $("<li/>",{"class":"dropdown"})
					.append($("<a/>",{html:yearLiteral,href:"#"})
						)
					.appendTo(yearList) //add a year grouper
				var yearMonthList = ($("<ul/>")).appendTo(yearGroup) 
				_.each(_.groupBy(annus,function(feature){
					if(feature.properties.timestamp){	return parseInt(feature.properties.timestamp.substring(5,7),10)}}),	
					function(mensis,monthSeqIndex){
						$("<li/>")
						.append($("<a/>",{href:"#",html:maaneder[parseInt(monthSeqIndex-1,10)].name,onclick:"injectMonth('" + yearLiteral + "-" + maaneder[parseInt(monthSeqIndex-1,10)].number + "')"}))
						.appendTo(yearMonthList); //and append the months of the year
				})
			}
		})
	}})
		
		
	
}

/* SECTION functions to control the population of the thumbpage or the map*/
/* SECTION functions to control the population of the thumbpage or the map*/
/* SECTION functions to control the population of the thumbpage or the map*/
/* SECTION functions to control the population of the thumbpage or the map*/



//Generic dataset loader
function loadDataset(url, onReady){
  $.getJSON(url, function(json){
    setCurrentDataset(json);
    onReady(currentDataset);
  }).fail(function(){
    alert("Could not load dataset: " + url);
  });
}

//check desired state
function isListMode(){
return document.getElementById("Choice-of-list").checked;
}


//--------The loader functions

//get stats form tiny generated datafile
$.getJSON("data/stats.json", function(s){
  $('#totalcount').html(s.total);
  $('#datedcount').html(s.dated);
  $('#gtcount').html(s.geotagged);
});

function injectNoDate(){
loadDataset("data/problems/no-timestamp.geo.json", (ds) => {
if (isListMode()) {
buildTiles(ds);
} else {
    showOnMap(getGeotaggedFeatures(ds));
window.location.href = "#mappage";
}
});
}




  



function injectMonth(month){
loadDataset("data/tid/" + month + ".geo.json", (ds) => {
if (isListMode()) {
buildTiles(ds);
} else {
    showOnMap(getGeotaggedFeatures(ds));
window.location.href = "#mappage";
}
});
}






//--------BEGIN NEW function from ChatGPT
function injectTrip(tripId, KMLfile, startDate, endDate){
  tripPixDates.startDate = startDate;
  tripPixDates.endDate = endDate;
loadDataset("data/anvendelse/" + tripId + ".geo.json", (ds) => {
if (isListMode()) {
buildTiles(ds);
} else {
    UseOnMap(KMLfile);
window.location.href = "#mappage" 
}
});
}



  

//-------- END NEW function from ChatGPT
function injectArea(areaId){
loadDataset("data/sted/" + areaId + ".geo.json", (ds) => {
if (isListMode()) {
buildTiles(ds);
} else {
    showOnMap(getGeotaggedFeatures(ds));
window.location.href = "#mappage";
}
});
}






/* SECTION Display builders*/
/* SECTION Display builders*/
/* SECTION Display builders*/
/* SECTION Display builders*/
//Thumbpage, imgpage, mappage, trippage

//build the thumbpage
function buildTiles(dataslice){ 
	//group the images by date
	dateGroup = _.groupBy(dataslice.features,function(feature){ 
		
		return feature.properties.timestamp?feature.properties.timestamp.split("T")[0]:feature.properties.image.substring(0,feature.properties.image.lastIndexOf("/")).split(" ").join("_").split("/").join("_").substring(2)
	})
	// scroll up and empty the thumbpage -  and incert new container
	$("#tilebox").animate({ scrollTop: 0 }, 'slow');
	$("#tilebox").empty()
	$("#tilebox").append($("<div/>").css({width:"90%",height:"3.5em"}))
	
	$.each(dateGroup,function(indexDate, featureDateGroup){ //for each date-group of images, make header and conainer
		$("#tilebox").append(
			$("<div/>",{"class":"dateDiv"})
				.append($("<div/>",{"class":"dateHeader","text":indexDate.indexOf("_") > -1?indexDate:new Intl.DateTimeFormat('da-DK',{ dateStyle: 'full'}).format(new Date(indexDate))}) 
					
					.append($("<input/>",{"type":"button","id":"loadDateImages","name":"loadDateImages","value":"load dato i geotagger"})
						.on("click", function(  ) {
                            UseOnMap(undefined,indexDate);
                             window.location.href = "#mappage"
                            }
						)
					))
					.append(
					$("<div/>",{"class":"dateDivMain","id":"dateDiv-" + indexDate})
				)
		)
		//create thumbnails for dategroup of images
		$.each(featureDateGroup,function(indexFeature,feature){ //for each image
			//get path to thumbnail image from image path
			img = "/Foto/" + feature.properties.image
			thumbPath = img.substring(0,img.lastIndexOf('/')) + "/.thumb/thumb-" + img.substring(img.lastIndexOf('/') +1) 
			//aapend thumbnail element
			$("#dateDiv-" + indexDate).append($("<div/>",{"class":"tile","title": feature.properties.timestamp?feature.properties.timestamp:feature.properties.image})
				.css({"cursor":"pointer"})
				//append thumbnail image
				.append($("<img>",{height:"100px",loading:"lazy",id:'th-' + feature.properties.index,"src":thumbPath})
					.on("click", function( event ) { //events when clicking thumbnail
						thumbPageScroll = window.pageYOffset; //store the vertical scroll of the page
					
						window.location.href = "#page-" + imgPage(feature.properties.index); //create and Navigate to image page for clicked thumb
						//preload next two images and the previous (by global image id)
						preloadAround(feature.properties.index)
						/*
						$("<img/>",{"class":"cacheImg","id":"cacheImg" + feature.properties.index+1,"src":theDataset.features[feature.properties.index+1].properties.image})
						$("<img/>",{"class":"cacheImg","id":"cacheImg" + feature.properties.index+2,"src":theDataset.features[feature.properties.index+2].properties.image})
						$("<img/>",{"class":"cacheImg","id":"cacheImg" + feature.properties.index11,"src":theDataset.features[feature.properties.index-1].properties.image})
						*/
					}
					)
				,
				//if image has coordinates, append geo-button to thumb	
				(feature.geometry)?$("<button/>",{"href":"#","data-role":"Button","data-icon":"ui-icon-location","data-show-label":"false","class":"ui-icon ui-button ui-button-icon-only ui-widget ui-icon-location ui-corner-all ui-alt-icon"}).css({'position':"absolute", 'bottom':'5px', 'right':'10px'}):null
				)
			)
			
		})

	})
		//if some images in thumbpage are geocoded, dispaly a button to show them on map
		if ($(".geomarker").length > 0)
			{$("#tilebox").append($("<button/>",{"data-role":"button", "data-enhanced":"true", "class":"ui-button ui-button-inline ui-corner-all ui-shadow ui-widget"})
			.text("Vis på kort")
			.css({"position":"absolute","top":"2%","right":"2%"})
			.on("click", function( event ) {
                showOnMap({"type":"FeatureCollection","features":_.filter(dataslice,function(feature){
					return feature.geometry;			
				})})
				window.location.href = "#mappage"
				})
		)}
	}

//Preloader - runs when imgPage is called
function preloadAround(i, radius = 3) {
  if (!currentDataset?.features) return;
  for (let k = i - radius; k <= i + radius; k++) {
    if (k < 0 || k >= currentDataset.features.length) continue;
    const img = currentDataset.features[k]?.properties?.image;
    if (!img) continue;
    const pre = new Image();
    pre.src = img; // browser cache warms up
  }
}



//Create the imagepage to display one photo	
function imgPage(imageIndex){
	currentImageIndex = imageIndex
	var info = currentDataset.features[imageIndex].properties //Metadata of the current image
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
					.append($("<img>",{src:"/Foto/" + currentDataset.features[imageIndex].properties.image,id:"image0"})
					.css({"max-height": $( window ).height() - 6 + "px","max-width": $( window ).width() - 6 + "px","display":"block","margin-right":"auto","margin-left":"auto"})
					)
					//button to cloase image
					.append($("<button/>",{"data-role":"button", "data-enhanced":"true", "class":"ui-icon ui-button ui-button-icon-only ui-widget ui-icon-delete ui-corner-all"})
						.text("No text")
						.css({"position":"absolute","top":"2%","right":"2%"})
						.on( "click", function(){$(".imagepage").remove();
							//if the trip interface is open, we should not close it when closing imgpage
							if (document.getElementsByClassName("trippix").length > 0)
							{window.location.href = "#mappage"}
							else
							{window.location.href = "#initial"
							setTimeout(function(){window.scrollBy(0,thumbPageScroll);},200)}
						
					})
					)
					//open infopanel
					.append($("<a/>",{ "href":"#iPanel","data-enhanced":"true", "class":"ui-icon ui-button ui-button-icon-only ui-widget ui-icon-info ui-corner-all"})
						.text("No text")
						.css({"position":"absolute","top":"2%","left":"2%"})
					)
					//browse back	
					.append($("<button/>",{"data-role":"button", "data-enhanced":"true", "class":"ui-icon ui-button ui-button-icon-only ui-widget ui-icon-arrow-l ui-corner-all"})
						.text("No text")
						.css({"position":"absolute","top":"49%","left":"2%"})
						.on( "click", function(){bladr(false)})
					)
					//browse forward
					.append($("<button/>",{"data-role":"button", "data-enhanced":"true", "class":"ui-icon ui-button ui-button-icon-only ui-widget ui-icon-arrow-r ui-corner-all"})
						.text("No text")
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
								loc = showOnMap({"type":"FeatureCollection","features":[currentDataset.features[imageIndex]]})
								window.location.href = "#" + loc
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
/*subsection: helpers for imgpage */
/*subsection: helpers for imgpage */
/*subsection: helpers for imgpage */

//	browsing images back and forth - accepts boolean to indicate direction (true=forth, false=back)
	function bladr (forth){
		var focusImageIndex = currentImageIndex
		window.location.href = "#page-" + imgPage(focusImageIndex + ((forth)?1:-1));
		$("#page-" + focusImageIndex).remove();
		//Preload images
		preloadAround(focusImageIndex)
		/*
		$("<img/>",{"class":"cacheImg","id":"cacheImg" + focusImageIndex + ((forth)?2:-2),"src":currentDataset.features[focusImageIndex + ((forth)?2:-2)].properties.image})
		$("<img/>",{"class":"cacheImg","id":"cacheImg" + focusImageIndex + ((forth)?3:-3),"src":currentDataset.features[focusImageIndex + ((forth)?3:-3)].properties.image})
		$("<img/>",{"class":"cacheImg","id":"cacheImg" + focusImageIndex + ((forth)?-1:1),"src":currentDataset.features[focusImageIndex + ((forth)?-1:1)].properties.image})
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

function clearPhotoMarkers() {
  if (photoCluster) {
     photoCluster.clearMarkers();
    photoCluster.setMap(null);
    photoCluster = null;
  }
  photoMarkers.forEach(m => { m.map = null; });
  photoMarkers = [];
}


async function showOnMap(mapFeatureCollection) {
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

    marker.addListener("gmp-click", () => {
      const img = f.properties.image;

      const thumbUrl =
        img.substring(0, img.lastIndexOf("/")) +
        "/.thumb/" +
        img.substring(img.lastIndexOf("/") + 1) +
        ".jpg";

      const featureIndex = f.properties.index;

      const div = document.createElement("div");
      const t = document.createElement("img");
      t.src = thumbUrl;
      t.style.height = "150px";
      t.style.cursor = "pointer";
      t.onclick = function () {
        injectImage(featureIndex);
      };
      div.appendChild(t);

      photoInfoWindow.setContent(div);
      photoInfoWindow.setPosition(position);
      photoInfoWindow.setOptions({ pixelOffset: new google.maps.Size(0, -20) });
      photoInfoWindow.open(map);
    });

    photoMarkers.push(marker);
    bounds.extend(position);
  });

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


/*
//show a set of features (images) on map as markers - returns mappage
function showOnMap(mapFeatureCollection){

map = mapCreator(); //get map construct from mapCreator function

		map.data.addGeoJson(mapFeatureCollection); //add the images
		//extend the map bounds to cover all loaded images
		var bounds = new google.maps.LatLngBounds(); 
			map.data.forEach(function(feature){
  				feature.getGeometry().forEachLatLng(function(latlng){
     				bounds.extend(latlng);
  				});
			});
			// not sure why
			google.maps.event.addListenerOnce(map, 'bounds_changed', function(event) {
				
				if (map.getZoom() > 15) {
				  map.setZoom(15);
				}
			  });
		//make map fit the extended bounds
		map.fitBounds(bounds,10);


	return "mappage" //to calling function for navigation
	}
*/

//function to make a map showing places from a trip along with a tree representation of the trip
async function UseOnMap(KMLfile,aDate){
      await markerReady;

	mapOverlayId = 0 //reset the number of added overlays (features)
	addedOverlays = [] //the array of features/overlays added to current map
	map = mapCreator() //get a map
	
	

	//add button to open geotagging interface
	const taggerbuttonDiv = document.createElement("div");
	addMapControl(taggerbuttonDiv, map,"tagger");
	map.controls[google.maps.ControlPosition.RIGHT_CENTER].push(taggerbuttonDiv);

	//create div for the use functions and append it to the mappage	
	var sidepanel = $("<div/>",{"id":"sidepanel"}).css({"height":"100%","width":"33%","align-self":"flex-end","display":"flex","flex-direction":"column"})
	$("#mappage > .pagecontents")
		.css({"display":"flex","flex-direction":"row"})
		.append(sidepanel)
		.children("#mapCanvas").css({"height":"100%","width":"66%"})
		
	if (KMLfile){AddTreeBox(KMLfile)}
	if (aDate){taggerInterface(aDate)}
	 
	   return "mappage" //for navigation by the calling function
      
}


function AddTreeBox(KMLfile){

	//add a button to the map for displaying images from the trip's timeframe
	const trippicsDiv = document.createElement("div");
		addMapControl(trippicsDiv, map,"trippics");
		map.controls[google.maps.ControlPosition.TOP_CENTER].push(trippicsDiv);


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
			if (Array.isArray(rootFolder.Folder)){
				//send the folder to the handling function with context given as the children of the root, folder depth = 2
				$.each(rootFolder.Folder,function(i,fol){doFolder(fol,treeDataChildren,2)})
			}
			else{ doFolder(rootFolder.Folder,treeDataChildren,2)}
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
				useBounds = new google.maps.LatLngBounds()
				useBounds.extend(ruth[0].folderBoundsNE)
				useBounds.extend(ruth[0].folderBoundsSW)
				map.fitBounds(useBounds,10)
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
			useBounds = new google.maps.LatLngBounds()
			useBounds.extend(node.original.folderBoundsNE)
			useBounds.extend(node.original.folderBoundsSW)
			map.fitBounds(useBounds,10)
		}
		if (node.original.kind === "polyline" || node.original.kind === "polygon"){
			//If the node represent a polyline, it also should store bounds
			useBounds = new google.maps.LatLngBounds()
			useBounds.extend(node.original.trackBoundsNE)
			useBounds.extend(node.original.trackBoundsSW)
			map.fitBounds(useBounds,10)
		}
	});

	//if you click a node, nothing happens...
	$('#treebox').on('select_node.jstree',function(e, data){
 	//console.log("tree:" + data)
	})


}
//Handle a placemark (place) in context of a treemap node (mother)
function doPlacemark(place, mother) {
  mapOverlayId = mapOverlayId + 1; //increment the number of overlays (features) added to the map

  // ---------- POINT ----------
  if (place.Point) {
    const position = LatLnger(place.Point.coordinates["#text"]); // {lat,lng}

    // Resolve icon style (Style or StyleMap->normal->Style)
    let styleObj = null;

    if (
      place.styleUrl &&
      objX.kml?.Document?.Style &&
      objX.kml.Document.Style.find(o => o.id === place.styleUrl["#text"].substring(1))
    ) {
      styleObj = objX.kml.Document.Style.find(o => o.id === place.styleUrl["#text"].substring(1)).IconStyle;
    } else if (
      place.styleUrl &&
      Array.isArray(objX.kml?.Document?.StyleMap) &&
      objX.kml.Document.StyleMap.find(o => o.id === place.styleUrl["#text"].substring(1))
    ) {
      const styleMap = objX.kml.Document.StyleMap.find(o => o.id === place.styleUrl["#text"].substring(1));
      const styleRef = styleMap.Pair.find(s => s.key["#text"] === "normal").styleUrl["#text"];
      styleObj = objX.kml.Document.Style.find(o => o.id === styleRef.substring(1)).IconStyle;
    }
  }
    // Icon URL -> local file path
    const rawIcon = styleObj?.Icon?.href?.["#text"] || "";
    const iconUrl = resolveKmlIconUrl(rawIcon);

    // Tree node
    mother.children.push({
      text: place.name?.["#text"] || "(uden navn)",
      state: { opened: false, selected: false },
      id: "ti_" + mapOverlayId,
      kind: "point",
      Point: position,
      icon: iconUrl // local path now
    });

    // InfoWindow (keep as-is)
    const infowindow = new google.maps.InfoWindow({
      content: place.name?.["#text"] || ""
    });




    // Marker: prefer AdvancedMarkerElement via createMarker() (local icon),
    
    const aMarker = createMarker({
      map,
      position,
      title: "ti_" + mapOverlayId,
      icon: iconUrl,
      // IMPORTANT: do NOT pass animation here, or createMarker will force classic Marker
    
    });




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
	if (doFolderDepth > folderDepth){folderDepth = doFolderDepth;}
	
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
/*subsection helpers for map-type pages*/
/*subsection helpers for map-type pages*/

//return map div with map instance
function mapCreator()
{
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
	  var infowindow = new google.maps.InfoWindow({
		content: "hello"
	  });
	
	  /*
	map.data.addListener('click', function(event) { //listen for click on marker
		//Make thumbnail
		var img = event.feature.getProperty('image');
		
		let thumbUrl = img.substring(0,img.lastIndexOf('/')) + "/.thumb/" + img.substring(img.lastIndexOf('/') +1) + ".jpg"
		
		//let imageUrl = event.feature.getProperty('image');
		let featureIndex = event.feature.getProperty('index');
		var tommel = document.createElement('img')
		tommel.src =  thumbUrl 
		tommel.style.height = '150px'
		tommel.onclick = function(){ //add click handler to create and navigate to the imagepage
			if (document.getElementsByClassName("trippix").length === 0) //if the trip interface is open (a button has had the class 'trippix' added), then remove it
				{
					//$(".mappage").remove();
				}
			//	window.location.href = "#page-" + imgPage(event.feature.i.index) } 
				window.location.href = "#page-" + imgPage(featureIndex) } 
			
		infowindow.setContent(tommel); // show the html variable in the infowindow
		infowindow.setPosition(event.latLng); // place the infowindow next to the clicked marker
		infowindow.setOptions({
			pixelOffset: new google.maps.Size(0, -20)
		}); // move the infowindow up slightly to the top of the marker icon
		infowindow.open(map);
		})

		*/
		//create the map control buttons

		const closeMapDiv = document.createElement("div"); //the close map button
		addMapControl(closeMapDiv, map,"close"); //call the button builder
		map.controls[google.maps.ControlPosition.TOP_CENTER].push(closeMapDiv); //add it to the map
		
		const loadOnMapDiv = document.createElement("div"); //load all images taken inside the map bounds as markder
		addMapControl(loadOnMapDiv, map,"load");
		map.controls[google.maps.ControlPosition.TOP_CENTER].push(loadOnMapDiv);
		
		const thumbsOnMapDiv = document.createElement("div"); //create thumbpage with all markers within map bounds
		addMapControl(thumbsOnMapDiv, map,"thumbs");
		map.controls[google.maps.ControlPosition.TOP_CENTER].push(thumbsOnMapDiv);
	
return map; //to the calling function 
}


//helper function to provide lng/lat literal
function LatLnger(point){
	return	{'lng': Number(point.split(",")[0]), 'lat': Number(point.split(",")[1])}
	}

//Iteratively Calculate the bounds that would contain the features referred by a tree node and its children - and store them on the node
function  calculateFolderBounds(treeData){
	do{//staring with the deepest folders, proceeding until depth = 1
	getObjects(treeData,'depth',folderDepth).forEach( //return all folders of a certain depth - initially using the globally stored max value
		function(foldr){
			var foldrBounds = new google.maps.LatLngBounds(); 
			foldr.children.forEach( //for each folder/node child, extend the folders bound by the child's bound
				function(child){
					if(child.kind === "point"){
						
						foldrBounds.extend({'lat':child.Point.lat,'lng':child.Point.lng})
						}
					if(child.kind === "polyline" && child.trackBounds){
						foldrBounds.extend({'lat':child.trackBounds.getNorthEast().lat(),'lng':child.trackBounds.getNorthEast().lng()})
						foldrBounds.extend({'lat':child.trackBounds.getSouthWest().lat(),'lng':child.trackBounds.getSouthWest().lng()})
							}
					if(child.kind === "container" && child.children.length > 0){
						//console.log(foldr)
						foldrBounds.extend({'lat':child.folderBounds.getNorthEast().lat(),'lng':child.folderBounds.getNorthEast().lng()})
						foldrBounds.extend({'lat':child.folderBounds.getSouthWest().lat(),'lng':child.folderBounds.getSouthWest().lng()})
					}
				}
			)
			//store the generated bound as literals on the node
			foldr.folderBounds = foldrBounds
			foldr.folderBoundsSW = {'lat':foldrBounds.getSouthWest().lat(),'lng':foldrBounds.getSouthWest().lng()}
			foldr.folderBoundsNE = {'lat':foldrBounds.getNorthEast().lat(),'lng':foldrBounds.getNorthEast().lng()}
					
		  

		}

	)
	//decrement the depth
	folderDepth = folderDepth - 1
	}while (folderDepth >= 1)
	
}

function addMapControl(controlDiv, map, mapDoWhat) {
  const controlUI = document.createElement("div");
  controlUI.style.backgroundColor = "#fff";
  controlUI.style.border = "2px solid #fff";
  controlUI.style.borderRadius = "3px";
  controlUI.style.boxShadow = "0 2px 6px rgba(0,0,0,3)";
  controlUI.style.cursor = "pointer";
  controlUI.style.marginBottom = "22px";
  controlUI.style.textAlign = "center";
  controlDiv.appendChild(controlUI);

  const controlText = document.createElement("div");
  controlText.style.color = "rgb(25,25,25)";
  controlText.style.fontFamily = "Roboto,Arial,sans-serif";
  controlText.style.fontSize = "16px";
  controlText.style.lineHeight = "38px";
  controlText.style.paddingLeft = "5px";
  controlText.style.paddingRight = "5px";
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
      controlText.innerHTML = "Gå væk";
      controlUI.addEventListener("click", () => {
        $(".mappage").remove();
        window.location.href = "#initial";
        setTimeout(function () { window.scrollBy(0, thumbPageScroll); }, 200);
      });
      break;

    case "load":
      // “Load all images within map bounds”
      // Now: just filter *currentDataset* by bounds (and GPS presence) and add those points to map.data
      controlText.innerHTML = "Se alle billeder fra dette område";
      controlUI.addEventListener("click", () => {
        const b = currentMapBounds();
        if (!b) return;

        const src = currentDataset;
        if (!src || !src.features) return;

        const featuresInBounds = src.features.filter(f => {
          const lat = f?.geometry?.coordinates?.[1];
          const lon = f?.geometry?.coordinates?.[0];
          if (typeof lat !== "number" || typeof lon !== "number") return false;
          return b.contains(new google.maps.LatLng(lat, lon));
        });

        map.data.addGeoJson({ type: "FeatureCollection", features: featuresInBounds });
      });
      break;

    case "thumbs":
      // “Show the markers currently visible on the map in the thumb-page”
      controlText.innerHTML = "Vis billedliste for disse markører";
      controlUI.addEventListener("click", () => {
        const b = currentMapBounds();
        if (!b) return;

        const out = { type: "FeatureCollection", features: [] };

        // map.data.forEach is sync, but feature.toGeoJson is async callback-based
        let pending = 0;

        map.data.forEach(feature => {
          const geom = feature.getGeometry();
          if (!boundsContainsPoint(b, geom)) return;

          pending++;
          feature.toGeoJson(gj => {
            // gj is a proper GeoJSON Feature
            out.features.push(gj);
            pending--;
            if (pending === 0) {
              $(".mappage").remove();
              window.location.href = "#initial";
              buildTiles(out);
            }
          });
        });

        // If nothing matched, still exit cleanly
        if (pending === 0) {
          $(".mappage").remove();
          window.location.href = "#initial";
          buildTiles(out);
        }
      });
      break;

    case "trippics":
      controlText.innerHTML = "Vis billeder for denne tur";
      controlUI.classList.add("trippix");
      controlUI.addEventListener("click", () => {
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

        // you probably still want geotag-only on map:
        map.data.addGeoJson(getGeotaggedFeatures({ type: "FeatureCollection", features: filtered }));
      });
      break;

    case "tagger":
      controlText.innerHTML = "G";
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
function getGeotaggedFeatures(inputData){//return only features with geotags from submitted features - accept and produce FeatureCollection
	return {"type":"FeatureCollection","features": _.filter(inputData.features,function(feature){return feature.geometry;})}
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
