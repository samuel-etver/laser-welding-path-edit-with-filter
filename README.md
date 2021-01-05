# laser-welding-path-edit-with-filter

Editor of the Y-coordinate of the path for the laser welding machine for large diameter pipes.

## Overview
Using the program, the Y-coordinates of the scanned pipe track are read from the Simatic S-300 controller.
Values can be changed either in the table or on the chart by dragging points.
Point status (valid/not valid) can be changed in the table.
The corrected path(or filtered path) is written back to the controller.
The path can be saved/loaded in csv or xml-format.<br>

![](Screenshots/image1.jpg)

![](Screenshots/image2.jpg)


## To Use

To clone and run this repository you'll need [Git](https://git-scm.com) and [Node.js](https://nodejs.org/en/download/) (which comes with [npm](http://npmjs.com)) installed on your computer. From your command line:

1. Clone this repository ```https://github.com/samuel-etver/laser-welding-path-edit-with-filter```
2. Go into the repository ```cd laser-welding-path-edit-with-filter```
3. Install dependencies ```npm install```
4. You should download jgplot plugins from https://github.com/jqPlot/jqPlot to .\node-modules\jqplot\plugins
5. Run the app ```npm start```
6. Build the app for Windows (64bit) ```electron-packager . --platform=win32 --arch=x64```
  
## Dependencies

electron: 7.3.3,<br>
electron-packager: 14.2.0,<br>
bootstrap: 4.5.3,<br>
csv-parser: 2.3.5,<br>
csv-writer: 1.6.0,<br>
jqplot: 1.0.9,<br>
jquery: 3.5.1,<br>
nodes7: 0.3.12,<br>
popper: 1.0.1,<br>
tabulator-tables: 4.9.3,<br>
xmldom: 0.2.1<br>

## License

[CC0 1.0 (Public Domain)](./LICENSE)
