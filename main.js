// Color Cycling in HTML5 Canvas
// BlendShift Technology conceived, designed and coded by Joseph Huckaby
// Copyright (c) 2001-2002, 2010 Joseph Huckaby.
// Released under the LGPL v3.0: http://www.opensource.org/licenses/lgpl-3.0.html

// Add-ons as Color Cycling Desktop Wallpaper:
//	-lower refresh rate for decreased CPU usage
//	-time-change aware (useful for laptop sleep/resume cycles)
//	-removal of UI elements
//	-weather sensitive for months that allow it
//	-get parameters from URL:
//		-force month selection
//		-double size
//		-force location

FrameCount.visible = false;

jQuery.ajaxPrefilter(function (options) {
  //if (options.url is not going to my server) { // pseudocode :)
  options.timeout = 5000;
  //}
});

var CanvasCycle = {
  cookie: new CookieTree(),
  query: parseQueryString(location.href),
  ctx: null,
  imageData: null,
  clock: 0,
  inGame: false,
  bmp: null,
  globalTimeStart: new Date().getTime(),
  inited: false,
  optTween: null,
  winSize: null,
  globalBrightness: 1.0,
  lastBrightness: 0,
  sceneIdx: -1,
  highlightColor: -1,
  defaultMaxVolume: 0.5,
  weather: null,
  lastChecked: null,
  forceView: null,
  size: null,
  place: null,
  stillLife: null,

  TL_WIDTH: 80,
  TL_MARGIN: 15,
  OPT_WIDTH: 150,
  OPT_MARGIN: 15,

  settings: {
    showOptions: false,
    targetFPS: 60,
    zoomFull: false,
    blendShiftEnabled: true,
    speedAdjust: 1.0,
    sound: false,
  },

  contentSize: {
    width: 640,
    optionsWidth: 0,
    height: 480 + 40,
    scale: 1.0,
  },

  preInit: function () {
    //force month selection
    if (QueryString.view)
      switch (QueryString.view.toLowerCase()) {
        case "january":
          this.forceView = 0;
          break;
        case "february":
          this.forceView = 1;
          break;
        case "march":
          this.forceView = 2;
          break;
        case "april":
          this.forceView = 3;
          break;
        case "may":
          this.forceView = 4;
          break;
        case "june":
          this.forceView = 5;
          break;
        case "july":
          this.forceView = 6;
          break;
        case "august":
          this.forceView = 7;
          break;
        case "september":
          this.forceView = 8;
          break;
        case "october":
          this.forceView = 9;
          break;
        case "november":
          this.forceView = 10;
          break;
        case "december":
          this.forceView = 11;
          break;
        case "random":
          this.stillLife = true;
          break;
      }

    //double size
    if (QueryString.zoom)
      if (QueryString.zoom.toLowerCase() == "true")
        this.settings.zoomFull = true;

    //force location
    if (QueryString.place) this.place = QueryString.place;

    this.getWeather(this.init, this);
  },

  init: function () {
    // called when DOM is ready
    if (!this.inited) {
      this.inited = true;
      $("container").style.display = "block";
      $("d_options").style.display = "none";
      $("d_timeline").style.display = "none";

      FrameCount.init();
      this.handleResize();

      var pal_disp = $("palette_display");
      for (var idx = 0, len = 256; idx < len; idx++) {
        var div = document.createElement("div");
        div._idx = idx;
        div.id = "pal_" + idx;
        div.className = "palette_color";
        div.onmouseover = function () {
          CanvasCycle.highlightColor = this._idx;
        };
        div.onmouseout = function () {
          CanvasCycle.highlightColor = -1;
        };
        pal_disp.appendChild(div);
      }
      var div = document.createElement("div");
      div.className = "clear";
      pal_disp.appendChild(div);

      // pick starting scene
      // var initialSceneIdx = Math.floor( Math.random() * scenes.length );
      // var initialSceneIdx = 0;
      if (this.stillLife == null) {
        if (this.weather == "sunny") scenes = scenesSunny;
        if (this.weather == "cloudy") scenes = scenesCloudy;
        if (this.weather == "rainy") scenes = scenesRainy;

        var monthIdx = new Date().getMonth();
        var initialSceneIdx = -1;
        for (var idx = 0, len = scenes.length; idx < len; idx++) {
          var scene = scenes[idx];
          if (scene.monthIdx == monthIdx) {
            initialSceneIdx = idx;
            idx = len;
          }
        }
        if (initialSceneIdx == -1) initialSceneIdx = 0;
      } else {
        scenes = scenesRandom;
        //pick a static scenes
        initialSceneIdx = Math.floor(Math.random() * scenes.length);
      }

      // populate scene menu
      var html = "";
      html += '<select id="fe_scene" onChange="CanvasCycle.switchScene(this)">';
      for (var idx = 0, len = scenes.length; idx < len; idx++) {
        var scene = scenes[idx];
        html +=
          '<option value="' +
          scene.name +
          '" ' +
          (idx == initialSceneIdx ? ' selected="selected"' : "") +
          ">" +
          scene.title +
          "</option>";
      }
      html += "</select>";
      $("d_scene_selector").innerHTML = html;

      // read prefs from cookie
      var prefs = this.cookie.get("settings");
      if (!prefs)
        prefs = {
          showOptions: true,
          targetFPS: 60,
          zoomFull: false,
          blendShiftEnabled: true,
          speedAdjust: 1.0,
          sound: false,
        };

      // allow query to override prefs
      for (var key in this.query) {
        prefs[key] = this.query[key];
      }

      if (prefs) {
        if (prefs.showOptions) this.toggleOptions();
        this.setRate(prefs.targetFPS);
        this.setSpeed(prefs.speedAdjust);
        this.setBlendShift(prefs.blendShiftEnabled);
        this.setSound(prefs.sound);
      }

      // start synced to local time
      if (this.stillLife == null) {
        var now = new Date();
        this.timeOffset =
          now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
        this.updateTimelineDisplay();
      }

      // setup timeline drag
      $("d_tl_thumb").addEventListener(
        "mousedown",
        function (e) {
          CC.tl_mouseDown = true;
          CC.tl_mouseOriginY = e.pageY;
          CC.tl_timeOrigin = CC.timeOffset;
          e.preventDefault();
          e.stopPropagation();
        },
        false
      );
      window.addEventListener(
        "mouseup",
        function (e) {
          CC.tl_mouseDown = false;
        },
        false
      );
      window.addEventListener(
        "mousemove",
        function (e) {
          if (CC.tl_mouseDown) {
            // visual thumb top range: 8px - 424px (416)
            var yDelta = e.pageY - CC.tl_mouseOriginY;
            CC.timeOffset =
              CC.tl_timeOrigin + Math.floor(yDelta * (86400 / 416));
            if (CC.timeOffset < 0) CC.timeOffset = 0;
            else if (CC.timeOffset >= 86400) CC.timeOffset = 86399;
            CC.updateTimelineDisplay();
          }
        },
        false
      );

      // keyboard shortcuts
      window.addEventListener(
        "keydown",
        function (e) {
          if (!e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
            switch (e.keyCode) {
              case 9: // tab
                if (CC.inGame) {
                  CC.stop();
                  if (CC.audioTrack) {
                    try {
                      CC.audioTrack.pause();
                    } catch (e) {}
                  }
                } else {
                  CC.run();
                  if (CC.audioTrack && CC.settings.sound) {
                    try {
                      CC.audioTrack.play();
                    } catch (e) {}
                  }
                }
                break;
              case 38: // up arrow
                CC.timeOffset -= 60;
                if (CC.timeOffset < 0) CC.timeOffset += 86400;
                CC.updateTimelineDisplay();
                break;
              case 40: // down arrow
                CC.timeOffset += 60;
                if (CC.timeOffset >= 86400) CC.timeOffset -= 86400;
                CC.updateTimelineDisplay();
                break;
              case 80: // P
                CC.toggleOptions();
                break;
              case 66: // B
                CC.setBlendShift(!CC.settings.blendShiftEnabled);
                break;
            }
            e.preventDefault();
            e.stopPropagation();
          }
        },
        false
      );

      // load initial scene
      if (this.forceView != null) this.sceneIdx = this.forceView;
      else this.sceneIdx = initialSceneIdx;
      this.loadScene(this.sceneIdx);
    }
  },

  newHour: function () {
    var initialSceneIdx = -1;

    if (this.stillLife != null) {
      scenes = scenesRandom;
      //pick a static scenes
      initialSceneIdx = Math.floor(Math.random() * scenes.length);
      CanvasCycle.sceneIdx = initialSceneIdx;
    } else {
      //if (this.weather=="sunny" && scenes != scenesSunny)
      //	scenes = scenesSunny;
      //default on sunny
      scenes = scenesSunny;
      if (this.weather == "cloudy" && scenes != scenesCloudy)
        scenes = scenesCloudy;
      if (this.weather == "rainy" && scenes != scenesCloudy)
        scenes = scenesRainy;

      var monthIdx = new Date().getMonth();
      var newSceneIdx = -1;
      for (var idx = 0, len = scenes.length; idx < len; idx++) {
        var scene = scenes[idx];
        if (scene.monthIdx == monthIdx) {
          newSceneIdx = idx;
          idx = len;
        }
      }
      if (newSceneIdx == -1) newSceneIdx = 0;
      if (CanvasCycle.forceView != null)
        CanvasCycle.sceneIdx = CanvasCycle.forceView;
      else CanvasCycle.sceneIdx = newSceneIdx;
    }

    CanvasCycle.loadScene(CanvasCycle.sceneIdx);
  },

  getWeather: function (callback, callbackObj) {
    var lctn = "";
    var whtr;
    this.lastChecked = new Date().getTime();
    jQuery
      .getJSON("https://freegeoip.app/json/")
      .done(function (data) {
        jsn = JSON.stringify(data, null, 2);
        if (CC.place == null || CC.place == undefined)
          lctn = data["city"] + ", " + data["country_name"];
        else lctn = CC.place;
        console.log(lctn);
        jQuery.simpleWeather({
          location: lctn,
          woeid: "",
          unit: "f",
          success: function (weather) {
            whtr = weather.currently.toLowerCase();
            console.log(whtr);
            if (
              whtr.indexOf("tornado") != -1 ||
              whtr.indexOf("hurricane") != -1 ||
              whtr.indexOf("thunder") != -1 ||
              whtr.indexOf("storm") != -1 ||
              whtr.indexOf("rain") != -1 ||
              whtr.indexOf("snow") != -1 ||
              whtr.indexOf("drizzle") != -1 ||
              whtr.indexOf("showers") != -1 ||
              whtr.indexOf("hail") != -1 ||
              whtr.indexOf("sleet") != -1 ||
              whtr.indexOf("dust") != -1 ||
              whtr.indexOf("blustery") != -1 ||
              whtr.indexOf("windy") != -1
            ) {
              CC.weather = "rainy";
            } else if (
              whtr.indexOf("foggy") != -1 ||
              whtr.indexOf("haze") != -1 ||
              whtr.indexOf("smoky") != -1 ||
              whtr.indexOf("cloudy") != -1
            ) {
              CC.weather = "cloudy";
            } else {
              CC.weather = "sunny";
            }
            callback.apply(callbackObj);
          },
          error: function (error) {
            CC.weather = null;
            callback.apply(callbackObj);
          },
        });
      })
      .fail(function (jqxhr, textStatus, error) {
        console.log(textStatus, error);
        CC.weather = null;
        callback.apply(callbackObj);
      });
  },

  updateTimelineDisplay: function () {
    // sync the timeline thumb position to the current time
    $("d_tl_thumb").style.top =
      "" + Math.floor(8 + this.timeOffset / (86400 / 416)) + "px";

    // also update the clocky
    var ampm = "AM";
    var hour = Math.floor(this.timeOffset / 3600);
    if (hour >= 12) {
      ampm = "PM";
      if (hour > 12) hour -= 12;
    } else if (hour == 0) hour = 12;
    if (hour < 10) hour = "0" + hour;

    var minute = Math.floor((this.timeOffset / 60) % 60);
    if (minute < 10) minute = "0" + minute;

    var second = Math.floor(this.timeOffset % 60);
    if (second < 10) second = "0" + second;

    $("d_tl_clock").innerHTML = "" + hour + ":" + minute + "&nbsp;" + ampm;
  },

  jumpScene: function (dir) {
    // next or prev scene
    this.sceneIdx += dir;
    if (this.sceneIdx >= scenes.length) this.sceneIdx = 0;
    else if (this.sceneIdx < 0) this.sceneIdx = scenes.length - 1;
    $("fe_scene").selectedIndex = this.sceneIdx;
    this.switchScene($("fe_scene"));
  },

  switchScene: function (menu) {
    // switch to new scene (grab menu selection)
    this.stopSceneAudio();

    var name = menu.options[menu.selectedIndex].value;
    this.sceneIdx = menu.selectedIndex;

    if (true) {
      // no transitions on mobile devices, just switch as fast as possible
      this.inGame = false;

      this.ctx.clearRect(0, 0, this.bmp.width, this.bmp.height);
      this.ctx.fillStyle = "rgb(0,0,0)";
      this.ctx.fillRect(0, 0, this.bmp.width, this.bmp.height);

      CanvasCycle.globalBrightness = 1.0;
      CanvasCycle.loadScene(this.sceneIdx);
    }
    //else {
    //   TweenManager.removeAll({ category: "scenefade" });
    //   TweenManager.tween({
    //     target: { value: this.globalBrightness, newSceneIdx: this.sceneIdx },
    //     duration: Math.floor(this.settings.targetFPS / 2),
    //     mode: "EaseInOut",
    //     algo: "Quadratic",
    //     props: { value: 0.0 },
    //     onTweenUpdate: function (tween) {
    //       CanvasCycle.globalBrightness = tween.target.value;
    //     },
    //     onTweenComplete: function (tween) {
    //       CanvasCycle.loadScene(tween.target.newSceneIdx);
    //     },
    //     category: "scenefade",
    //   });
    // }
  },

  loadScene: function (idx) {
    // load image JSON from the server
    this.stop();
    this.showLoading();

    var scene = scenes[idx];
    if (this.stillLife == null) {
      var url =
        "file=" +
        scene.name +
        "&month=" +
        scene.month +
        "&script=" +
        scene.scpt +
        ".js";
    } else var url = "file=" + scene.name + ".js";
    var scr = document.createElement("SCRIPT");
    scr.type = "text/javascript";
    scr.src = url;
    document.getElementsByTagName("HEAD")[0].appendChild(scr);
  },

  showLoading: function () {
    // show spinning loading indicator
    var loading = $("d_loading");
    var kicker = this.settings.showOptions ? this.TL_WIDTH + this.TL_MARGIN : 0;
    loading.style.left =
      "" +
      Math.floor(
        kicker + ((this.contentSize.width * this.contentSize.scale) / 2 - 16)
      ) +
      "px";
    loading.style.top =
      "" +
      Math.floor((this.contentSize.height * this.contentSize.scale) / 2 - 16) +
      "px";
    loading.show();
  },

  hideLoading: function () {
    // hide spinning loading indicator
    $("d_loading").hide();
  },

  initScene: function (scene) {
    if (this.stillLife == null) {
      // initialize, receive image data from server
      this.initPalettes(scene.palettes);
      this.initTimeline(scene.timeline);

      // force a full palette and pixel refresh for first frame
      this.oldTimeOffset = -1;

      // create an intermediate palette that will hold the time-of-day colors
      this.todPalette = new Palette(scene.base.colors, scene.base.cycles);
    }
    // process base scene image
    if (this.stillLife == null) this.bmp = new Bitmap(scene.base);
    else this.bmp = new Bitmap(scene);
    this.bmp.optimize();

    var canvas = $("mycanvas");
    if (!canvas.getContext) return; // no canvas support

    if (!this.ctx) this.ctx = canvas.getContext("2d");
    this.ctx.clearRect(0, 0, this.bmp.width, this.bmp.height);
    this.ctx.fillStyle = "rgb(0,0,0)";
    this.ctx.fillRect(0, 0, this.bmp.width, this.bmp.height);

    if (!this.imageData) {
      if (this.ctx.createImageData) {
        this.imageData = this.ctx.createImageData(
          this.bmp.width,
          this.bmp.height
        );
      } else if (this.ctx.getImageData) {
        this.imageData = this.ctx.getImageData(
          0,
          0,
          this.bmp.width,
          this.bmp.height
        );
      } else return; // no canvas data support
    }
    //MAYBE: remove?
    this.bmp.clear(this.imageData);

    if (true) {
      // no transition on mobile devices
      this.globalBrightness = 1.0;
    }
    //else {
    //   this.globalBrightness = 0.0;
    //   TweenManager.removeAll({ category: "scenefade" });
    //   TweenManager.tween({
    //     target: { value: 0 },
    //     duration: Math.floor(this.settings.targetFPS / 2),
    //     mode: "EaseInOut",
    //     algo: "Quadratic",
    //     props: { value: 1.0 },
    //     onTweenUpdate: function (tween) {
    //       CanvasCycle.globalBrightness = tween.target.value;
    //     },
    //     category: "scenefade",
    //   });
    // }

    this.startSceneAudio();
  },

  initPalettes: function (pals) {
    // create palette objects for each raw time-based palette
    var scene = scenes[this.sceneIdx];

    this.palettes = {};
    for (var key in pals) {
      var pal = pals[key];

      if (scene.remap) {
        for (var idx in scene.remap) {
          pal.colors[idx][0] = scene.remap[idx][0];
          pal.colors[idx][1] = scene.remap[idx][1];
          pal.colors[idx][2] = scene.remap[idx][2];
        }
      }

      var palette = (this.palettes[key] = new Palette(pal.colors, pal.cycles));
      palette.copyColors(palette.baseColors, palette.colors);
    }
  },

  initTimeline: function (entries) {
    // create timeline with pointers to each palette
    this.timeline = {};
    for (var offset in entries) {
      var palette = this.palettes[entries[offset]];
      if (!palette)
        return alert(
          "ERROR: Could not locate palette for timeline entry: " +
            entries[offset]
        );
      this.timeline[offset] = palette;
    }
  },

  run: function () {
    // start main loop
    if (!this.inGame) {
      this.inGame = true;
      this.animate();
    }
  },

  stop: function () {
    // stop main loop
    this.inGame = false;
  },

  animate: function () {
    // animate one frame. and schedule next
    if (this.inGame) {
      var colors = this.bmp.palette.colors;

      if (this.settings.showOptions) {
        for (var idx = 0, len = colors.length; idx < len; idx++) {
          var clr = colors[idx];
          var div = $("pal_" + idx);
          div.style.backgroundColor =
            "rgb(" + clr.red + "," + clr.green + "," + clr.blue + ")";
        }

        // if (this.clock % this.settings.targetFPS == 0) $('d_debug').innerHTML = 'FPS: ' + FrameCount.current;
        $("d_debug").innerHTML =
          "FPS: " +
          FrameCount.current +
          (this.highlightColor != -1 ? " - Color #" + this.highlightColor : "");
      }

      //if (this.stillLife == null){
      var optimize = true;
      var newSec = FrameCount.count();

      if (newSec && !this.tl_mouseDown) {
        // advance time
        var now = new Date();
        this.timeOffset =
          now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
        if (this.timeOffset >= 86400) this.timeOffset = 0;
        this.updateTimelineDisplay();
        if (this.timeOffset % 60 == 0) {
          //new minute: check if more than 3h passed since last weatherCheck
          var diffMs = now.getTime() - this.lastChecked; // milliseconds between now & lastChecked
          var diffMins = Math.round(diffMs / 60000); // minutes
          if (diffMins > 180) this.getWeather(this.newHour, this);
        }
      }
      if (this.stillLife == null) {
        if (this.timeOffset != this.oldTimeOffset) {
          // calculate time-of-day base colors
          //resync with clock
          this.setTimeOfDayPalette();
          optimize = false;
        }
      }
      //}

      if (this.lastBrightness != this.globalBrightness) optimize = false;
      if (this.highlightColor != this.lastHighlightColor) optimize = false;

      // cycle palette
      this.bmp.palette.cycle(
        this.bmp.palette.baseColors,
        GetTickCount(),
        this.settings.speedAdjust,
        this.settings.blendShiftEnabled
      );

      if (this.highlightColor > -1) {
        this.bmp.palette.colors[this.highlightColor] = new Color(0, 0, 0);
      }
      if (this.globalBrightness < 1.0) {
        // bmp.palette.fadeToColor( pureBlack, 1.0 - globalBrightness, 1.0 );
        this.bmp.palette.burnOut(1.0 - this.globalBrightness, 1.0);
      }

      // render pixels
      this.bmp.render(this.imageData, optimize);
      this.ctx.putImageData(this.imageData, 0, 0);

      this.lastBrightness = this.globalBrightness;
      this.lastHighlightColor = this.highlightColor;
      this.oldTimeOffset = this.timeOffset;

      TweenManager.logic(this.clock);
      this.clock++;
      this.scaleAnimate();

      if (this.inGame)
        // setTimeout(function () {
        //   CanvasCycle.animate();
        // }, 100 /*was: 1  -- result in less cpu throttle*/);
        requestAnimationFrame(function () {
          CanvasCycle.animate();
        });
    }
  },

  setTimeOfDayPalette: function () {
    // fade palette to proper time-of-day

    // locate nearest timeline palette before, and after current time
    // auto-wrap to find nearest out-of-bounds events (i.e. tomorrow and yesterday)
    var before = {
      palette: null,
      dist: 86400,
      offset: 0,
    };
    //console.log(this.timeOffset);
    //var noww = new Date();
    //console.log(noww.getHours());

    for (var offset in this.timeline) {
      if (offset <= this.timeOffset && this.timeOffset - offset < before.dist) {
        before.dist = this.timeOffset - offset;
        before.palette = this.timeline[offset];
        before.offset = offset;
      }
    }
    if (!before.palette) {
      // no palette found, so wrap around and grab one with highest offset
      var temp = 0;
      for (var offset in this.timeline) {
        if (offset > temp) temp = offset;
      }
      before.palette = this.timeline[temp];
      before.offset = temp - 86400; // adjust timestamp for day before
    }

    var after = {
      palette: null,
      dist: 86400,
      offset: 0,
    };
    for (var offset in this.timeline) {
      if (offset >= this.timeOffset && offset - this.timeOffset < after.dist) {
        after.dist = offset - this.timeOffset;
        after.palette = this.timeline[offset];
        after.offset = offset;
      }
    }
    if (!after.palette) {
      // no palette found, so wrap around and grab one with lowest offset
      var temp = 86400;
      for (var offset in this.timeline) {
        if (offset < temp) temp = offset;
      }
      after.palette = this.timeline[temp];
      after.offset = temp + 86400; // adjust timestamp for day after
    }

    // copy the 'before' palette colors into our intermediate palette
    this.todPalette.copyColors(
      before.palette.baseColors,
      this.todPalette.colors
    );

    // now, fade to the 'after' palette, but calculate the correct 'tween' time
    this.todPalette.fade(
      after.palette,
      this.timeOffset - before.offset,
      after.offset - before.offset
    );

    // finally, copy the final colors back to the bitmap palette for cycling and rendering
    // only for seize the day
    this.bmp.palette.importColors(this.todPalette.colors);
  },

  scaleAnimate: function () {
    // handle scaling image up or down
    if (this.settings.zoomFull) {
      // scale up to full size
      var totalNativeWidth =
        this.contentSize.width + this.contentSize.optionsWidth;
      var maxScaleX = this.winSize.width / totalNativeWidth;

      var totalNativeHeight = this.contentSize.height;
      var maxScaleY = this.winSize.height / totalNativeHeight;

      var maxScale = Math.min(maxScaleX, maxScaleY);

      if (this.contentSize.scale != maxScale) {
        this.contentSize.scale += (maxScale - this.contentSize.scale) / 8;
        if (Math.abs(this.contentSize.scale - maxScale) < 0.001)
          this.contentSize.scale = maxScale; // close enough

        var sty = $("mycanvas").style;

        if (ua.webkit)
          sty.webkitTransform =
            "translate3d(0px, 0px, 0px) scale(" + this.contentSize.scale + ")";
        else if (ua.ff)
          sty.MozTransform = "scale(" + this.contentSize.scale + ")";
        else if (ua.op)
          sty.OTransform = "scale(" + this.contentSize.scale + ")";
        else sty.transform = "scale(" + this.contentSize.scale + ")";

        sty.marginRight =
          "" +
          Math.floor(
            this.contentSize.width * this.contentSize.scale -
              this.contentSize.width
          ) +
          "px";
        $("d_header").style.width =
          "" +
          Math.floor(this.contentSize.width * this.contentSize.scale) +
          "px";
        this.repositionContainer();
      }
    } else {
      // scale back down to native
      if (this.contentSize.scale > 1.0) {
        this.contentSize.scale += (1.0 - this.contentSize.scale) / 8;
        if (this.contentSize.scale < 1.001) this.contentSize.scale = 1.0; // close enough

        var sty = $("mycanvas").style;

        if (ua.webkit)
          sty.webkitTransform =
            "translate3d(0px, 0px, 0px) scale(" + this.contentSize.scale + ")";
        else if (ua.ff)
          sty.MozTransform = "scale(" + this.contentSize.scale + ")";
        else if (ua.op)
          sty.OTransform = "scale(" + this.contentSize.scale + ")";
        else sty.transform = "scale(" + this.contentSize.scale + ")";

        sty.marginRight =
          "" +
          Math.floor(
            this.contentSize.width * this.contentSize.scale -
              this.contentSize.width
          ) +
          "px";
        $("d_header").style.width =
          "" +
          Math.floor(this.contentSize.width * this.contentSize.scale) +
          "px";
        this.repositionContainer();
      }
    }
  },

  repositionContainer: function () {
    // reposition container element based on inner window size
    var div = $("container");
    if (div) {
      this.winSize = getInnerWindowSize();
      div.style.left =
        "" +
        Math.floor(
          this.winSize.width / 2 -
            (this.contentSize.width * this.contentSize.scale +
              this.contentSize.optionsWidth) /
              2
        ) +
        "px";
      div.style.top =
        "" +
        // "0" +
        Math.floor(
          this.winSize.height / 2 -
            (this.contentSize.height * this.contentSize.scale) / 2
        ) +
        "px";
    }
  },

  handleResize: function () {
    // called when window resizes
    this.repositionContainer();
    if (this.settings.zoomFull) this.scaleAnimate();
  },

  saveSettings: function () {
    // save settings in cookie
    this.cookie.set("settings", this.settings);
    this.cookie.save();
  },

  startSceneAudio: function () {
    // start audio for current scene, if applicable
    var scene = scenes[this.sceneIdx];
    if (scene.sound && this.settings.sound && window.Audio) {
      if (this.audioTrack) {
        try {
          this.audioTrack.pause();
        } catch (e) {}
      }
      TweenManager.removeAll({ category: "audio" });

      var ext = ua.ff || ua.op ? "ogg" : "mp3";
      var track = (this.audioTrack = new Audio(
        "audio/" + scene.sound + "." + ext
      ));
      track.volume = 0;
      track.loop = true;
      track.autobuffer = false;
      track.autoplay = true;

      track.addEventListener(
        "canplaythrough",
        function () {
          track.play();
          TweenManager.tween({
            target: track,
            duration: Math.floor(CanvasCycle.settings.targetFPS * 2),
            mode: "EaseOut",
            algo: "Linear",
            props: { volume: scene.maxVolume || CanvasCycle.defaultMaxVolume },
            category: "audio",
          });
          CanvasCycle.hideLoading();
          CanvasCycle.run();
        },
        false
      );

      if (ua.iphone || ua.ipad) {
        // these may support audio, but just don't invoke events
        // try to force it
        setTimeout(function () {
          track.play();
          track.volume = 1.0;
          CanvasCycle.hideLoading();
          CanvasCycle.run();
        }, 1000);
      }

      if (ua.ff || ua.mobile) {
        // loop doesn't seem to work on FF or mobile devices, so let's force it
        track.addEventListener(
          "ended",
          function () {
            track.currentTime = 0;
            track.play();
          },
          false
        );
      }

      track.load();
    } // sound enabled and supported
    else {
      // no sound for whatever reason, so just start main loop
      this.hideLoading();
      this.run();
    }
  },

  stopSceneAudio: function () {
    // fade out and stop audio for current scene
    var scene = scenes[this.sceneIdx];
    if (scene.sound && this.settings.sound && window.Audio && this.audioTrack) {
      var track = this.audioTrack;

      if (true) {
        // no transition here, so just stop sound
        track.pause();
      }
      // else {
      //   TweenManager.removeAll({ category: "audio" });
      //   TweenManager.tween({
      //     target: track,
      //     duration: Math.floor(CanvasCycle.settings.targetFPS / 2),
      //     mode: "EaseOut",
      //     algo: "Linear",
      //     props: { volume: 0 },
      //     onTweenComplete: function (tween) {
      //       // ff has weird delay with volume fades, so allow sound to continue
      //       // will be stopped when next one starts
      //       if (!ua.ff) track.pause();
      //     },
      //     category: "audio",
      //   });
      // }
    }
  },

  toggleOptions: function () {
    var startValue, endValue;
    TweenManager.removeAll({ category: "options" });

    if (!this.settings.showOptions) {
      startValue = 0;
      if (this.optTween) startValue = this.optTween.target.value;
      endValue = 1.0;
      $("d_options").style.display = "";
      $("d_options").style.opacity = startValue;
      // $("btn_options_toggle").innerHTML = "&#x00AB; Hide Options";

      // $("d_timeline").style.width = "0px";
      // $("d_timeline").style.display = "";
      // $("d_timeline").style.opacity = startValue;
    } else {
      startValue = 1.0;
      if (this.optTween) startValue = this.optTween.target.value;
      endValue = 0;
      // $("btn_options_toggle").innerHTML = "Show Options &#x00BB;";
    }

    this.optTween = TweenManager.tween({
      target: { value: startValue },
      duration: Math.floor(this.settings.targetFPS / 3),
      mode: "EaseOut",
      algo: "Quadratic",
      props: { value: endValue },
      onTweenUpdate: function (tween) {
        // $('d_options').style.left = '' + Math.floor(tween.target.value - 150) + 'px';
        $("d_options").style.opacity = tween.target.value;
        // $("btn_options_toggle").style.left =
        // "" + Math.floor(tween.target.value * 128) + "px";

        // var tl_sty = $("d_timeline").style;
        // tl_sty.opacity = tween.target.value;
        // tl_sty.width = "" + Math.floor(tween.target.value * CC.TL_WIDTH) + "px";
        // tl_sty.marginRight =
        //   "" + Math.floor(tween.target.value * CC.TL_MARGIN) + "px";

        $("d_header").style.marginLeft =
          "" +
          Math.floor(tween.target.value * (CC.TL_WIDTH + CC.TL_MARGIN)) +
          "px";

        CanvasCycle.contentSize.optionsWidth = 0;
        // Math.floor(
        //   tween.target.value *
        //     (CC.OPT_WIDTH + CC.OPT_MARGIN + CC.TL_WIDTH + CC.TL_MARGIN)
        // );
        CanvasCycle.handleResize();
      },
      onTweenComplete: function (tween) {
        if (tween.target.value == 0) {
          $("d_options").style.display = "none";
          $("d_timeline").style.display = "none";
        }
        CanvasCycle.optTween = null;
      },
      category: "options",
    });

    this.settings.showOptions = !this.settings.showOptions;
    this.saveSettings();
  },

  setZoom: function (enabled) {
    if (enabled != this.settings.zoomFull) {
      this.settings.zoomFull = enabled;
      this.saveSettings();
      $("btn_zoom_actual").setClass("selected", !enabled);
      $("btn_zoom_max").setClass("selected", enabled);
    }
  },

  setSound: function (enabled) {
    $("btn_sound_on").setClass("selected", enabled);
    $("btn_sound_off").setClass("selected", !enabled);
    this.settings.sound = enabled;

    if (this.sceneIdx > -1) {
      if (enabled) {
        // enable sound
        if (this.audioTrack) this.audioTrack.play();
        else this.startSceneAudio();
      } else {
        // disable sound
        if (this.audioTrack) this.audioTrack.pause();
      }
    }

    this.saveSettings();
  },

  setRate: function (rate) {
    /* $('btn_rate_30').setClass('selected', rate == 30);
		$('btn_rate_60').setClass('selected', rate == 60);
		$('btn_rate_90').setClass('selected', rate == 90); */
    this.settings.targetFPS = rate;
    this.saveSettings();
  },

  setSpeed: function (speed) {
    $("btn_speed_025").setClass("selected", speed == 0.25);
    $("btn_speed_05").setClass("selected", speed == 0.5);
    $("btn_speed_1").setClass("selected", speed == 1);
    $("btn_speed_2").setClass("selected", speed == 2);
    $("btn_speed_4").setClass("selected", speed == 4);
    this.settings.speedAdjust = speed;
    this.saveSettings();
  },

  setBlendShift: function (enabled) {
    $("btn_blendshift_on").setClass("selected", enabled);
    $("btn_blendshift_off").setClass("selected", !enabled);
    this.settings.blendShiftEnabled = enabled;
    this.saveSettings();
  },
};

var CC = CanvasCycle;
