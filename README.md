# Alakajam! tools

This repo contains additional data & scripts for the [Alakajam!](https://github.com/mkalam-alami/alakajam) website. For now its only goal is to help with performance tests.

## Setup

* Clone this repository besides the main `alakajam/` folder.
* Run `npm install`

## `ld37-data` 

This uses data from [Liam Lime's](http://liamlime.com/experiments/ldscrape/out-ludum-dare-37.html) scraper to load all users & entries from Ludum Dare 37 to Alakajam.

* Make sure you have set up a `config.js` file in the Alakajam folder.
* Run `node ld37-data/run.js` to make it fill the database.

## `docs` 

Wireframes to test new page layouts