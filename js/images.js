/*Ø SECTION Global variables*/
	var theDataset; //Global variable storing the data loaded from geojson
	var theAreas; //a set of geograpical areas (countries) for cookie cutting - loaded from JSON file
	var theTrips; //a list with descriptions of the trips available as KML - loaded from JSON file
	let map; //global variable storing the Google Maps map
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
	/*


screen.orientation.addEventListener('change', function(e) {
	alert("Angle" + e.target.screen.orientation.angle)
	//$("#image0").css({"max-height": $( window ).height() - 6 + "px","max-width": $( window ).width() - 6 + "px"}) })
}

screen.addEventListener("orientationchange", function () {
	alert("The orientation of the screen is: " + screen.orientation);
  });
*/
 
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

function initMap(){
	//function runs when map API is ready - not used but required by Maps API
}
/* SECTION main setup of environment */
/* SECTION main setup of environment */
/* SECTION main setup of environment */
/* SECTION main setup of environment */
/* SECTION main setup of environment */

//setup datasources
//function started by index.html
function loadData(){
	$('select').selectmenu().selectmenu('disable'); //disable dropdowns until data are ready

	//load the geographical areas
	$.getJSON("areas.json", function(json) {
		theAreas = json;
		makeAreaLinks(theAreas); //call function to fill dropdown
	})
	//load the trip descriptions
	$.getJSON("trips.json", function(json) {
		theTrips = json;
		makeTripLinks(theTrips); //call function to fill dropdown
	})
	//load the image information
	$.getJSON("images.geo.json", function(json) {
		json.features =_.sortBy(json.features,function(feature){return feature.properties.timestamp}) //order dataset by image timestamp
		$.each(json.features,function(index,feature){
			feature.properties.index = index; //create image index in loaded and ordered dataset
		})
		theDataset = {"type":"FeatureCollection","features":json.features}; //create the globas dataset as a GeoJSON FeatureCollection
		//Create counters
		$('#totalcount').html(theDataset.features.length) //total number of images
		$('#datedcount').html(_.filter(theDataset.features,function(feature){return feature.properties.timestamp}).length) //Number of images with timestams
		$('#gtcount').html(getGeotaggedFeatures(theDataset).features.length)//number of geotagged images - use helper function
		makeMonthLinks(theDataset); //call function to fill dropdown
		$('#spinner').remove(); //remove the wait image
		$('select').selectmenu('enable'); //enable the dropdowns

		//make list links clickable i phone mode
		const li = document.querySelectorAll('li.dropdown a');
		li.forEach((each)=>{
			if (each.nextElementSibling !== null) {
				each.addEventListener('click', e=>{
					if (window.innerWidth < 1068) {
					e.target.parentElement.classList.toggle("active");  
					}
				})
			}
		})
			
	})

}
/*
//fill areas dropdown - enable actions on select
function makeAreaLinks(theAreas){
	$('#areaSelect').on( "change", function( event ) { //on selection of area, call function to create thumbs for this area
		injectArea(event.target.value);
	})

	$.each(theAreas.features,function(index,feature){ // create the dropdown entries
		$('#areaSelect').append($("<option/>",{value:index,"class":"anOption"}).text(feature.properties.name));
	})
}
*/

//fill areas dropdown - enable actions on select
//New area dropdown
function makeAreaLinks(theAreas){
	

	theAreas.features.forEach( (feature,index) =>{ // create the dropdown entries
		$('#dropPlace').append($("<li/>").append(  $("<a/>",{onclick:"injectArea(" + index + ")",html:feature.properties.name ,href:"#"})))
		
	})
}

//fill trip dropdown - enable actions on select
/*
function makeTripLinks(theTrips){
	$('#tripSelect').on( "change", function( event ) {  //on selection of trip, call function to mappage with this trip, navigate to it
		window.location.href = "#" + UseOnMap(event.target.value.split("&")[0]);
	})

	theTrips.grupper.forEach(function(grp){
		 OG = $("<optgroup\>",{label:grp.designation}).appendTo("#tripSelect") // create group in dropdown
		 grp.ture.forEach( tur => OG.append($("<option/>",{value:tur.filename + "&" + tur.startDate + "&" + tur.endDate ,"class":"anOption"}).text(tur.designation).attr("title",tur.title)))//create dropdown entry
	})
}
*/
function makeTripLinks(theTrips){
	/*$('#dropTrip').on( "change", function( event ) {  //on selection of trip, call function to mappage with this trip, navigate to it
		window.location.href = "#" + UseOnMap(event.target.value.split("&")[0]);
	})
*/
	theTrips.grupper.forEach(gruppe =>
		{


			
			var Gruppe = $("<li/>",{"class":"dropdown"})
					.append($("<a/>",{html:gruppe.designation,href:"#"}))
					.appendTo("#dropTrips") //add a trip type grouper
				var GruppeTureListe = ($("<ul/>")).appendTo(Gruppe) 
			//return gruppe.ture	

			
			gruppe.ture.forEach(tur =>
				{
				 $("<li/>")
						.append($("<a/>",{href:"#",html:tur.designation,onclick:"injectTrip('" + tur.filename + "', '" + tur.startDate + "', '" + tur.endDate + "')"}))
						.appendTo(GruppeTureListe)
				}
				) //and append the months of the year
			}
		)

/*
		function(grp){
		 OG = $("<optgroup\>",{label:grp.designation}).appendTo("#dropTrip") // create group in dropdown
		 grp.ture.forEach( tur => OG.append($("<option/>",{value:tur.filename + "&" + tur.startDate + "&" + tur.endDate ,"class":"anOption"}).text(tur.designation).attr("title",tur.title)))//create dropdown entry

		})
*/
	}

//fill months dropdown - enable action on select to load thumbs from the month
function makeMonthLinks(theDataset){
		
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

	/*
	//on change, start handling function
	$('#monthSelect').on( "change", function( event ) {
		//injectMessage('working');
		if (event.target.value == "noDate"){//if selecting 'no date', start process for images without timestamp
			injectNoDate();
		}
		else{
			injectMonth( event.target.value);//else, start process for month-group of images
		}
	})

	//add a 'no date' option
	$('#monthSelect').append($("<option/>",{value:"noDate","class":"notAnOption"}).text("Uden dato"));

	//months in year-optgroups
	//Maybe done better?
	$.each( _.groupBy(theDataset.features //for each year group of images
		,
				function(feature){if(feature.properties.timestamp){
					return feature.properties.timestamp.substring(0,4)}
				})
		,function(yearLiteral,annus){
			if (yearLiteral != "undefined"){
				var yearGroup = $("<optgroup\>",{label:yearLiteral}).appendTo("#monthSelect") //add a year grouper
				_.each(_.groupBy(annus,function(feature){
					if(feature.properties.timestamp){	return parseInt(feature.properties.timestamp.substring(5,7),10)}}),	
					function(mensis,monthSeqIndex){
						$("<option/>",{text:maaneder[parseInt(monthSeqIndex-1,10)].name,value:yearLiteral + '-' + maaneder[parseInt(monthSeqIndex-1,10)].number}).appendTo(yearGroup); //and append the months of the year
				})
			}
		})

		*/

/*
<!--
			  <li><a tabindex="-1" href="#">HTML</a></li>
			  <li><a tabindex="-1" href="#">CSS</a></li>
			  <li class="dropdown-submenu">
				<a class="test" tabindex="-1" href="#">New dropdown <span class="caret"></span></a>
				<ul class="dropdown-menu">
				  <li><a tabindex="-1" href="#">2nd level dropdown</a></li>
				  <li><a tabindex="-1" href="#">2nd level dropdown</a></li>
				  <li class="dropdown-submenu">
					<a class="test" href="#">Another dropdown <span class="caret"></span></a>
					<ul class="dropdown-menu">
					  <li><a href="#"  onclick="injectMonth('2019-01')">2019-01</a></li>
					  <li><a href="#">3rd level dropdown</a></li>
					</ul>
				  </li>
				</ul>
			  </li>
			-->

*/

		//Make new month menu

		$('#dropMonths').append($("<li/>").append($("<a/>",{onclick:"injectNoDate()",html:"udenfor tiden" ,href:"#"})))

		
		$.each( _.groupBy(theDataset.features //for each decade group of images
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
		
		//_.groupBy(theDataset.features,function(f){if (f.properties.timestamp) {return f.properties.timestamp.substring(0,4)}}).forEach(g => console.log(g))
		
		//fedeFeatures = theDataset.features
		//fedeFeatures.group()
		//const ttt = fedeFeatures.group(f => f.properties.timestamp.substring(0,4));//.forEach(yGroup => debug.print(yGroup))
	//console.log(ttt)
	
}

/* SECTION functions to control the population of the thumbpage or the map*/
/* SECTION functions to control the population of the thumbpage or the map*/
/* SECTION functions to control the population of the thumbpage or the map*/
/* SECTION functions to control the population of the thumbpage or the map*/

function injectNoDate(){ //populate thumbpage with images without timestamp
	buildTiles({"type":"FeatureCollection","features": _.reject(theDataset.features,function(feature){
			return feature.properties.timestamp 
		}).filter(feature => feature.properties.image)
	}
	)
}

function injectMonth(month){ //populate thumbpage or map with images from specific month
	//if ($("#Choice-of-list").is(':checked')) //populate thumbpage (buildTiles)
	if (document.getElementById("Choice-of-list").checked) //populate thumbpage (buildTiles)
	{
		buildTiles({"type":"FeatureCollection","features": _.filter(theDataset.features,function(feature){
			if (feature.properties.timestamp){
				return feature.properties.timestamp.startsWith(month)
				}
			})
		}
		)
	}
	else //populate map (showOnMap)
	{
		window.location.href = "#" + showOnMap( getGeotaggedFeatures({"type":"FeatureCollection","features": _.filter(theDataset.features,function(feature){
			if (feature.properties.timestamp){
				return feature.properties.timestamp.startsWith(month)
				}
			})}))
	}
		
}


function injectArea(areaIndex){ //populate thumbpage or map with images from specific area
	if (document.getElementById("Choice-of-list").checked)//populate thumbpage (buildTiles)
	{
		
		buildTiles({"type":"FeatureCollection","features":turf.pointsWithinPolygon(getGeotaggedFeatures(theDataset), theAreas.features[areaIndex]).features});
	}
	else //populate map (showOnMap)
	{
		window.location.href = "#" + showOnMap({"type":"FeatureCollection","features":turf.pointsWithinPolygon(getGeotaggedFeatures(theDataset), theAreas.features[areaIndex]).features})
	}
}
function injectTrip(KMLfile,startDate,endDate){
	tripPixDates.startDate = startDate;
	tripPixDates.endDate = endDate;
	if (document.getElementById("Choice-of-list").checked)//populate thumbpage (buildTiles)
	{
		var startDate = new Date(tripPixDates.startDate);
		var endDate = new Date(tripPixDates.endDate);
		buildTiles( {"type":"FeatureCollection","features":theDataset.features.filter(f => {
					var date = new Date(f.properties.timestamp);
					return (date >= startDate && date <= endDate);
				  })})
		//buildTiles({"type":"FeatureCollection","features":turf.pointsWithinPolygon(getGeotaggedFeatures(theDataset), theAreas.features[areaIndex]).features});
	}
	else //populate map (showOnMap)
	{
		window.location.href = "#" + UseOnMap(KMLfile)
	}
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
						.on("click", function(  ) { window.location.href = "#" + UseOnMap(undefined,indexDate);}
						)
					))
					.append(
					$("<div/>",{"class":"dateDivMain","id":"dateDiv-" + indexDate})
				)
		)
		//create thumbnails for dategroup of images
		$.each(featureDateGroup,function(indexFeature,feature){ //for each image
			//get path to thumbnail image from image path
			img = "./Foto/" + feature.properties.image
			thumbPath = img.substring(0,img.lastIndexOf('/')) + "/.thumb/" + img.substring(img.lastIndexOf('/') +1) + ".jpg"
			//aapend thumbnail element
			$("#dateDiv-" + indexDate).append($("<div/>",{"class":"tile","title": feature.properties.timestamp?feature.properties.timestamp:feature.properties.image})
				.css({"cursor":"pointer"})
				//append thumbnail image
				.append($("<img>",{height:"100px",loading:"lazy",id:'th-' + feature.properties.index,"src":thumbPath})
					.on("click", function( event ) { //events when clicking thumbnail
						thumbPageScroll = window.pageYOffset; //store the vertical scroll of the page
					
						window.location.href = "#page-" + imgPage(feature.properties.index); //create and Navigate to image page for clicked thumb
						//preload next two images and the previous (by global image id)
						$("<img/>",{"class":"cacheImg","id":"cacheImg" + feature.properties.index+1,"src":theDataset.features[feature.properties.index+1].properties.image})
						$("<img/>",{"class":"cacheImg","id":"cacheImg" + feature.properties.index+2,"src":theDataset.features[feature.properties.index+2].properties.image})
						$("<img/>",{"class":"cacheImg","id":"cacheImg" + feature.properties.index11,"src":theDataset.features[feature.properties.index-1].properties.image})
						
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
				window.location.href = "#" + showOnMap({"type":"FeatureCollection","features":_.filter(dataslice,function(feature){
					return feature.geometry;			
				})})
				})
		)}
	}

//Create the imagepage to display one photo	
function imgPage(imageIndex){
	currentImageIndex = imageIndex
	var info = theDataset.features[imageIndex].properties //Metadata of the current image
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
					.append($("<img>",{src:"./Foto/" + theDataset.features[imageIndex].properties.image,id:"image0"})
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
					.append((theDataset.features[imageIndex].geometry)
						?
						$("<button/>",{"data-role":"button", "data-enhanced":"true", "class":"ui-icon ui-button ui-button-icon-only ui-widget ui-icon-location ui-corner-all"})
							.text("No text")
							.css({"position":"absolute","top":"2%","right":"12%"})
							.on("click", function( event ) {
								loc = showOnMap({"type":"FeatureCollection","features":[theDataset.features[imageIndex]]})
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
		$("<img/>",{"class":"cacheImg","id":"cacheImg" + focusImageIndex + ((forth)?2:-2),"src":theDataset.features[focusImageIndex + ((forth)?2:-2)].properties.image})
		$("<img/>",{"class":"cacheImg","id":"cacheImg" + focusImageIndex + ((forth)?3:-3),"src":theDataset.features[focusImageIndex + ((forth)?3:-3)].properties.image})
		$("<img/>",{"class":"cacheImg","id":"cacheImg" + focusImageIndex + ((forth)?-1:1),"src":theDataset.features[focusImageIndex + ((forth)?-1:1)].properties.image})
		
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


//function to make a map showing places from a trip along with a tree representation of the trip
function UseOnMap(KMLfile,aDate){

	mapOverlayId = 0 //reset the number of added overalays (features)
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

	//make markers jump, when mouse is over corresponding tree node
	$('#treebox').on('hover_node.jstree',function(e,data){
		if (data.node.original.kind === "point"){
			//Use the array of added features to get the marker based on tree node id
			var overlayTag = addedOverlays.find(o => o.id === data.node.original.id) 
			let jumper = overlayTag.overlay
			jumper.setAnimation(google.maps.Animation.BOUNCE);
		
		//stop the jumping
			$('#treebox').on('dehover_node.jstree',function(e,data){
				jumper.setAnimation(null);
			})
		}

	})
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
function doPlacemark(place,mother){
	mapOverlayId = mapOverlayId +1; //increment the number of overlays (features) added to the map
	
	//if the handled palce is a point
	if (place.Point){
		var position = LatLnger(place.Point.coordinates['#text']) //convert to latlng literal
		//if the place has a styleUrl and if a corresponding Style can be found in the KML document
		if (place.styleUrl && objX.kml.Document.Style.find(o => o.id === place.styleUrl['#text'].substring(1))){
			//get the iconStyle from the KML document
			var styleObj = objX.kml.Document.Style.find(o => o.id === place.styleUrl['#text'].substring(1)).IconStyle;
		}
		//if not (the style is probably stored as styleMap array)
		else{
			//if place has a styleUrl and if an array of StyleMaps exist in kml and if that array contains a StyleMap corresponding to the url a hand
			if (place.styleUrl &&  Array.isArray(objX.kml.Document.StyleMap) && objX.kml.Document.StyleMap.find(o => o.id === place.styleUrl['#text'].substring(1))){
				//get that styleMap
				styleMap = objX.kml.Document.StyleMap.find(o => o.id === place.styleUrl['#text'].substring(1))
				//get the 'normal' style from the map
				styleRef = styleMap.Pair.find(s => s.key['#text'] === "normal").styleUrl['#text'];
				//get the icon from the 'normal' style
				var styleObj = objX.kml.Document.Style.find(o => o.id === styleRef.substring(1)).IconStyle;
			}
		}
			
		//make a new child in the context node, identified by its mapoverlayId	
		mother.children.push({'text':place.name['#text'],
		'state': {	'opened' :false,'selected' : false},
		'id':"ti_" + mapOverlayId ,
		'kind':"point",
		'Point': position,
		'icon': (styleObj)?styleObj.Icon.href['#text']:""//also hotSpot
		})
		//create a corresponding map infowindow for the place
		const infowindow = new google.maps.InfoWindow({
			content: place.name['#text'],
		  });
		 //create a map marker for the place, identified with the same mapOverlayId
		  var aMarker = new google.maps.Marker({
			position: position,
			map,
			title: "ti_" + mapOverlayId,
			animation: google.maps.Animation.DROP,
			icon: (styleObj)?styleObj.Icon.href['#text']:"",//også hotSpot 
		  });
		
		  //add the identifier and the marker to the array of added overlays
		  addedOverlays.push( {id:"ti_" + mapOverlayId,overlay:aMarker})
		  
		  //make marker respond to click by opening the infowindow
		  aMarker.addListener("click", () => {
			infowindow.open({
			  anchor: aMarker,
			  map,
			  shouldFocus: false,
			  
			});
		  });
		 //Make maker repsond to mouseover by highlighting its node in the tree (matching the markers title to the tree node id)
		  aMarker.addListener("mouseover",(mapsMouseEvent) => {
			$('#treebox').jstree('deselect_all');
			$('#treebox').jstree('select_node', aMarker.title);

		  })
		  
	}

	//if the place is a polyline that has data i.e. a coordinate array
	if (place.LineString && place.LineString.coordinates['#text']){
		var coords = []
				
		//if the polyline has coordinates
		if(place.LineString.coordinates['#text']){
			//create coordinate array from KML coordinates
			coords = place.LineString.coordinates['#text'].trim().split(" ").map(p => LatLnger(p))
			//make a bounds object bounding the polyline
			var trackBounds = new google.maps.LatLngBounds()
			coords.forEach(lala => trackBounds.extend(lala))
			
		}
		//If a Style exist, corresponding to the place's StyleUrl
		if (objX.kml.Document.Style.find(o => o.id === place.styleUrl['#text'].substring(1))){
			//store the linestyle from the KML document as styleObj
			var styleObj = objX.kml.Document.Style.find(o => o.id === place.styleUrl['#text'].substring(1)).LineStyle;
		}
		else{
			//if a style map exist insteda
			if (objX.kml.Document.StyleMap.find(o => o.id === place.styleUrl['#text'].substring(1))){
				//get the linestyle from the 'normal' entryy in the map
				styleMap = objX.kml.Document.StyleMap.find(o => o.id === place.styleUrl['#text'].substring(1))
				styleRef = styleMap.Pair.find(s => s.key['#text'] === "normal").styleUrl['#text'];
				var styleObj = objX.kml.Document.Style.find(o => o.id === styleRef.substring(1)).LineStyle;
			}
		}
		//get the color from the stored style object	
		KMLcolor =(styleObj && styleObj.color)?styleObj.color['#text']:"00000000"
	//create path object from the coordinates, using the styles 
	const flightPath = new google.maps.Polyline({
		path: coords,
		geodesic: true,
		strokeColor: "#" + KMLcolor.substring(6,7) +  KMLcolor.substring(4,5) + KMLcolor.substring(2,3),
		strokeOpacity: 1.0,
		strokeWeight: (styleObj)?parseInt(styleObj.width['#text']):6,
	  });
	  //put on the map
	  flightPath.setMap(map);
	  //make a node in the tree, store the bounds as literals, identify by the counter
	  mother.children.push({
		'text':(place.name)?place.name['#text']:"--//--",
		  'state': {	'opened' :false,'selected' : false},
		  'id': mapOverlayId,
		  'kind':"polyline",
		  'trackBoundsSW':(trackBounds)?{'lat':trackBounds.getSouthWest().lat(),'lng':trackBounds.getSouthWest().lng()}:"",
		'trackBoundsNE':(trackBounds)?{'lat':trackBounds.getNorthEast().lat(),'lng':trackBounds.getNorthEast().lng()}:"", 
		  'trackBounds':(trackBounds)?trackBounds:"",  
		  'icon': ""
		 
	  })
	  //add the polyline to the array of added overlays
	  addedOverlays.push( {id:mapOverlayId,overlay:flightPath})
	}
		//if it is a poligon
	if (place.Polygon ){
		var coords = []
		//if it has coordinates
		if(place.Polygon.outerBoundaryIs.LinearRing.coordinates['#text']){
			//make coordinates from the KML data coordinates
			coords = place.Polygon.outerBoundaryIs.LinearRing.coordinates['#text'].trim().split(" ").map(p => LatLnger(p))
			//make a bounds object and extend it by each coordinate in the poligon
			var trackBounds = new google.maps.LatLngBounds()
			coords.forEach(lala => trackBounds.extend(lala))
			
		}
			//create new poligon
			//shouldnt it be identified?
			const bermudaTriangle = new google.maps.Polygon({
				paths: coords,
				strokeColor: "#FF0000",
				strokeOpacity: 0.8,
				strokeWeight: 2,
				fillColor: "#FF0000",
				fillOpacity: 0.35,
			  });


	
	
			  bermudaTriangle.setMap(map);
	  //ad node to the tree, identify and store bounds
	  mother.children.push({
		'text':(place.name)?place.name['#text']:"--//--",
		  'state': {	'opened' :false,'selected' : false},
		  'id': mapOverlayId,
		  'kind':"polygon",
		  'trackBoundsSW':(trackBounds)?{'lat':trackBounds.getSouthWest().lat(),'lng':trackBounds.getSouthWest().lng()}:"",
		'trackBoundsNE':(trackBounds)?{'lat':trackBounds.getNorthEast().lat(),'lng':trackBounds.getNorthEast().lng()}:"", 
		  'trackBounds':(trackBounds)?trackBounds:"",  
		  'icon': ""
		 
	  })
	  //Put the poligon into the overlay array
	  addedOverlays.push( {id:mapOverlayId,overlay:bermudaTriangle})
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
		center: ({lat:0,lng:0}),
		zoom: 8
	  });
	  //create infovindow - the pop-up appearing when clicking a map marker
	  var infowindow = new google.maps.InfoWindow({
		content: "hello"
	  });
	
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
//greate map buttons and their functionality - supply places to put the button and a keyword describing what it should do
function addMapControl(controlDiv, map, mapDoWhat) {
	// Set CSS for the control border
	const controlUI = document.createElement("div");
	controlUI.style.backgroundColor = "#fff";
	controlUI.style.border = "2px solid #fff";
	controlUI.style.borderRadius = "3px";
	controlUI.style.boxShadow = "0 2px 6px rgba(0,0,0,.3)";
	controlUI.style.cursor = "pointer";
	controlUI.style.marginBottom = "22px";
	controlUI.style.textAlign = "center";
	
	controlDiv.appendChild(controlUI);
	// Set CSS for the control interior
	const controlText = document.createElement("div");
	
	controlText.style.color = "rgb(25,25,25)";
	controlText.style.fontFamily = "Roboto,Arial,sans-serif";
	controlText.style.fontSize = "16px";
	controlText.style.lineHeight = "38px";
	controlText.style.paddingLeft = "5px";
	controlText.style.paddingRight = "5px";
	
	controlUI.appendChild(controlText);
	//depending on the action keyword
	switch (mapDoWhat) {
		case "close"://make a button to close the map and browse back to the thumbnail page 
			controlText.innerHTML = "Gå væk";
			controlUI.addEventListener("click", () => {
				  $(".mappage").remove();
				  window.location.href = "#initial";
				  //,scroll to the stored position where we left it
		
				  setTimeout(function(){window.scrollBy(0,thumbPageScroll);},200)
			});
		break;
		case "load"://load all images taken (and geotagged) within map bounds
			controlText.innerHTML = "Se alle billeder fra dette område";
			controlUI.addEventListener("click", () => {
				newBounds= map.getBounds(true)
				map.data.addGeoJson(
					turf.pointsWithinPolygon(//create boundingbox from map bounds and cookie cut the image data
					//minX, minY, maxX, maxY 
						getGeotaggedFeatures(theDataset), 
						turf.bboxPolygon([newBounds.getSouthWest().lng(),newBounds.getSouthWest().lat(),newBounds.getNorthEast().lng(),newBounds.getNorthEast().lat()])
					)
				);
			});
			break;
		case "thumbs"://show the images presently marked on the map in the thumbs-page
			controlText.innerHTML = "Vis billedliste for disse markører";
			controlUI.addEventListener("click", () => {
				visibleFeaturecollection = {"type":"FeatureCollection","features":[]};
				theBounds= map.getBounds(true)
				map.data.forEach(element => element.getGeometry().forEachLatLng(LatLng => {//loop through the elements on the map to see if they arein bound and then add them to the array
					//may work only for markers added through the data interface
					if (theBounds.contains(LatLng))
					{visibleFeaturecollection.features.push( {type:"Feature",properties:element.i,"geometry": {"type": "Point", "coordinates": [element.g.g.lng(),element.g.g.lat()]}})}
				}))
				$(".mappage").remove();//close the mappage
				window.location.href = "#initial"
				buildTiles(visibleFeaturecollection)//submit to the tile builder
			
			});
			break; 
			case "trippics": //show the pictures form the trip's timeframe on the map
			controlText.innerHTML = "Vis billeder for denne tur";
			controlUI.classList.add("trippix");//telling the world that the trip interface is open
			controlUI.addEventListener("click", () => {
				//get the trip's dates from the value of the HTML trip dropdown
				//var startDate = new Date($("#tripSelect :selected").val().split("&")[1]);
				//var endDate = new Date($("#tripSelect :selected").val().split("&")[2]);
				var startDate = new Date(tripPixDates.startDate);
				var endDate = new Date(tripPixDates.endDate);
				//filter theDataset by date, remove non-geotagged and plot on map
				map.data.addGeoJson(getGeotaggedFeatures(  {"type":"FeatureCollection","features":theDataset.features.filter(f => {
					var date = new Date(f.properties.timestamp);
					return (date >= startDate && date <= endDate);
				  })}))
			});
			break; 
			case "tagger": //show the Geotagging interface
			controlText.innerHTML = "G";
			controlUI.addEventListener("click", () => {
				taggerInterface();
			});
			break; 
		default:
		break;
	}
  }

  //Create the geotagging interface
function taggerInterface(aDate){
	//Setup the drawingManager to handle placements of images on map
	//const drawingManager = new google.maps.drawing.DrawingManager({
	drawingManager = new google.maps.drawing.DrawingManager({
			drawingMode: google.maps.drawing.OverlayType.MARKER,
		drawingControl: true,
		drawingControlOptions: {
		  position: google.maps.ControlPosition.RIGHT_BOTTOM,
		  drawingModes: [
			google.maps.drawing.OverlayType.MARKER
		  ],
		}
		
	  });
	//give the manager a map
	  drawingManager.setMap(map);
	  //do not use it right now
	  drawingManager.setDrawingMode(null);
	  //when the interim marker have been placed, let putMarkers() take over, and remove the interim marker
	  google.maps.event.addListener(drawingManager, 'markercomplete', function(drawnMarker) {
		
		$(".chosen").each(function(number,chosenImage){imageToMap(chosenImage,drawnMarker.position,true)})
		drawingManager.setDrawingMode((document.getElementsByClassName('chosen').length > 0)?'marker':null);	
		makeTextFile(addedMarkers);
		drawnMarker.setMap(null)
			//drawingManager.setDrawingMode('null');	
			
		
	  });




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
			theDataset.features.filter(f => {//toggle ikke-geotaggede
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
							
								//var overlayTag = addedOverlays.find(o => o.id === data.node.original.id) 
								//let jumper = overlayTag.overlay
								jumper?jumper.marker.setAnimation(google.maps.Animation.BOUNCE):null;
							
											
							
							
							})
							.mouseout(function(){
								$(".floatingImage").remove();
								jumper.marker.setAnimation(null);
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
										f.marker.setMap(null)
										addedMarkers.splice(addedMarkers.indexOf(f),1)
										}
									})
									makeTextFile(addedMarkers);
									
								}
								drawingManager.setDrawingMode((document.getElementsByClassName('chosen').length > 0)?'marker':null);	
									
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
				f.marker.setMap(null)
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
			drawingManager.setDrawingMode((document.getElementsByClassName('chosen').length > 0)?'marker':null);	
		 }))
		 //add deselect button
	.append($("<input/>",{"type":"button","id":"selectNone","name":"selectNone","value":"Intet","data-role":"none"})
		.on("click", function( event ) { //remove the 'chosen' class
			Array.from(document.getElementsByClassName('chosen')).forEach(i => $(i).removeClass("chosen"))
			drawingManager.setDrawingMode((document.getElementsByClassName('chosen').length > 0)?'marker':null);	
		}))


	.append($("<select/>",{id:"pointSelect","data-native-menu":"true", "data-mini":"true","data-role":"none"})//build dropdown
		.append($("<option/>",{text:"Vælg et sted"})) 
		.on( "change", function( event ) { //On selection 
			
			$(".chosen").each(function(number,chosenImage){imageToMap(chosenImage,{lat:Number(event.target.value.split(",")[0]),lng:Number(event.target.value.split(",")[1])},true)})
			makeTextFile(addedMarkers);
			drawingManager.setDrawingMode((document.getElementsByClassName('chosen').length > 0)?'marker':null);
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
	addedBounds.extend({lat:addedMarkers[i].geometry.coordinates[0],lng:addedMarkers[i].geometry.coordinates[1]});
}


}
else{
	addedBounds.extend({lng:8.08997684086,lat:54.8000145534});
	addedBounds.extend({lng: 12.6900061378,lat:57.730016588});

	//'DK': ('Denmark', (8.08997684086, 54.8000145534, 12.6900061378, 57.730016588)),
    
}
map.fitBounds(addedBounds);

	}
	
	/*
	//when the interim marker has been dropped
	function putMarkers(position)
	{	//work on the images chosen in the box
		$(".chosen").each(function(number,chosenImage){imageToMap(chosenImage,position)})
		drawingManager.setDrawingMode((document.getElementsByClassName('chosen').length > 0)?'marker':null);	
		makeTextFile(addedMarkers);
	}

	*/

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
		const putMarker = new google.maps.Marker({
			position: position,
			map,
			title: "Lige her!",
			icon: theIcon,
			draggable:true,
			customMarkerIndex:chosenImage.dataset.index,
		  });
		  //console.log(putMarker.position.lat(),putMarker.position.lng())
		//add a reference to  marker to the addedMarkers array - as a feature
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
				geometry:{"type": "Point", "coordinates": [	putMarker.position.lat(),putMarker.position.lng()] } ,
				marker: putMarker
				
			}
		)
		//add listener - if marker is moved, update the corresponding marker in addedMarkers - add the newGeo tag
		putMarker.addListener("dragend", () => {
			addedMarkers.forEach(function (m){ 
				if (m.properties.index === putMarker.customMarkerIndex)
				{m.geometry.coordinates = [	putMarker.position.lat(),putMarker.position.lng()];
				m.properties.newGeo = true;
				}}
			)
			//write the array of markers to the poweshell textfile
			makeTextFile(addedMarkers);
			//console.log(putMarker.position.lat(),putMarker.position.lng(),addedMarkers.find(m => m.properties.index === putMarker.customMarkerIndex).geometry.coordinates)
			});
			//if marker is right-clicked - remove it from addedMarkers, from the map and revert the box-thumb back to not-placed
		putMarker.addListener("contextmenu",function() { 
			dex = putMarker.customMarkerIndex;
			addedMarkers.forEach(function(f) { 
				if (f.properties.index === dex)
				{removeThis = addedMarkers.indexOf(f)}}
				)
			addedMarkers.splice(removeThis,1)
			$(".placed").each(function(x,i){
				if (i.dataset.index === dex)
				{$(i).removeClass("placed")}
				})	
			putMarker.setMap(null)
			//console.log(addedMarkers)
			//write the array of markers to the poweshell textfile
			makeTextFile(addedMarkers);
		})
		//when mouse is over the marker - show larger image
		putMarker.addListener("mouseover",function(){
			if(! $("#hidePreview")[0].checked){
			$("#mappage").append($("<img/>",{"src":putMarker.icon.url,"class":"floatingImage"}).css({ "top": "200px",	"z-index": "2000","position":"absolute","left":"200px",}))
				}
			})
			putMarker.addListener("mouseout",function(){
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
