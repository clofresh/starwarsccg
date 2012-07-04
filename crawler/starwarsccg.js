// standard lib
var fs   = require('fs'),
    path = require('path');

// 3rd party libs
var spider  = require('spider'),
    request = require('request'),
    csv     = require('ya-csv'),
    genPool = require('generic-pool');

var domain = "www.starwarsccg.org",
    base = "/cardlists/"
    start = "Premiere.html",
    csvDir = "data",
    imgDir = "public/img",
    queuedUrls = {};
queuedUrls[start] = true;

// Helpful monkeypatch
String.prototype.strip = function() {
    return this.replace(/^\s*(.*?)\s*$/, '$1')
}

// Create the output directory if it doesn't already exist
var toCreate = [csvDir, imgDir];
toCreate.forEach(function(dir) {
  try {
    fs.mkdirSync(dir);
  } catch (e) {
    if (e.code != 'EEXIST') {
      throw e
    }
  }
})

var s = spider(),
    downloaders = genPool.Pool({
      name: 'downloaders',
      max: 10,
      create: function(callback) {
        callback()
      }
    });

// The main spider route for the cardlists
s.route(domain, "/cardlists/:cardlist.html", function(window, $) {
  var cardlist = this.params.cardlist,
      cardlistFile = path.join(csvDir, cardlist + '.csv'),
      // Instantiate the csv writer for this cardlist
      writer = csv.createCsvStreamWriter(fs.createWriteStream(cardlistFile));


  // Iterate through all the cards
  var numCards = 0;
  $('table.sw table.sw tbody tr').each(function() {
    // The card list table is 3 cols: type, name, rarity
    var $typeCol   = $(this).find('td:nth-child(1) img'),
        $nameCol   = $(this).find('td:nth-child(2) a'),
        $rarityCol = $(this).find('td:nth-child(3)');

    var type   = $typeCol.attr('src'),
        text   = $typeCol.attr('alt'),
        name   = $nameCol.text().strip(),
        img    = $nameCol.attr('href'),
        rarity = $rarityCol.text().strip();
    if (text == 'alt') {
      text = ''
    }

    // If there's an img href for the row, assume it's a valid card
    if (img) {
      numCards += 1;

      var imgUrl = "http://" + domain + base + img,
          imgFilename = path.join.apply({},
            [imgDir].concat(img.split(path.sep).filter(function(p, i) {
              return i == 2 || i == 4
            })));

      downloaders.acquire(function() {
        if (!fs.existsSync(imgFilename)) {
          // Create the directory to store the image file in
          fs.mkdir(path.dirname(imgFilename), 0777, function() {
            // Do an http request to get the image and pipe the 
            // http output stream into a file stream.
            var req = request.get({url:imgUrl});
            req.pipe(fs.createWriteStream(imgFilename));
            req.on("end", function() {
              console.log("Downloaded " + imgUrl + " to " + imgFilename)
              downloaders.release()
            });
          });
        } else {
          downloaders.release()
        }
      })

      // Write the card info to the csv file
      writer.writeRecord([cardlist, name, type, text, rarity, img, imgFilename.replace('public', '')]);
    }
  })
  
  console.log('Read ' + numCards + ' cards from ' + this.url.href)

  // Iterate through the cardlists just once
  $('table.sw a.smo').map(function() {
    var url = base + $(this).attr('href');
    if (!queuedUrls[url]) {
      console.log('Queuing ' + url + ' for spidering')
      queuedUrls[url] = true;
      return this
    }
  }).spider();
})
// Kick off the crawl
.get("http://" + domain + base + start)




