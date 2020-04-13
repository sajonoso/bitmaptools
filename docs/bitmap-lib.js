/**
 * @author Me
 *
 * Bmp format decoder,support 1bit 4bit 8bit 24bit bmp
 *
 */

function Z_readUInt8(buf, pos) {
  return buf[pos] | 0
}
function Z_readUInt16LE(buf, pos) {
  return ((buf[pos + 1] | 0) << 8) + (buf[pos] | 0)
}
function Z_readUInt32LE(buf, pos) {
  return (Z_readUInt16LE(buf, pos + 2) << 16) + Z_readUInt16LE(buf, pos)
}

const Z_readInt32LE = Z_readUInt32LE

function BmpDecoder(buffer, is_with_alpha) {
  var thisBM = {}
  thisBM.pos = 0
  thisBM.buffer = buffer
  thisBM.is_with_alpha = !!is_with_alpha
  thisBM.bottom_up = true
  thisBM.flag = String.fromCharCode.apply(null, thisBM.buffer).slice(0, 2)

  if (thisBM.flag != 'BM') throw new Error('Invalid BMP File')
  Z_parseHeader(thisBM)
  Z_parseRGBA(thisBM)
  return thisBM
}

Z_parseHeader = function(thisBM) {
  thisBM.fileSize = Z_readUInt32LE(thisBM.buffer, 0x02)
  thisBM.reserved = Z_readUInt32LE(thisBM.buffer, 0x06)
  thisBM.offset = Z_readUInt32LE(thisBM.buffer, 0x0a)
  thisBM.headerSize = Z_readUInt32LE(thisBM.buffer, 0x0e)
  thisBM.width = Z_readUInt32LE(thisBM.buffer, 0x12)
  thisBM.height = Z_readInt32LE(thisBM.buffer, 0x16)
  thisBM.planes = Z_readUInt16LE(thisBM.buffer, 0x1a)
  thisBM.bitPP = Z_readUInt16LE(thisBM.buffer, 0x1c)
  thisBM.compress = Z_readUInt32LE(thisBM.buffer, 0x1e)
  thisBM.rawSize = Z_readUInt32LE(thisBM.buffer, 0x22)
  thisBM.hr = Z_readUInt32LE(thisBM.buffer, 0x26)
  thisBM.vr = Z_readUInt32LE(thisBM.buffer, 0x2a)
  thisBM.colors = Z_readUInt32LE(thisBM.buffer, 0x2e)
  thisBM.importantColors = Z_readUInt32LE(thisBM.buffer, 0x32)
  thisBM.pos = 0x32 + 4

  if (thisBM.bitPP === 16 && thisBM.is_with_alpha) {
    thisBM.bitPP = 15
  }
  if (thisBM.bitPP < 15) {
    var len = thisBM.colors === 0 ? 1 << thisBM.bitPP : thisBM.colors
    thisBM.palette = new Array(len)
    for (var i = 0; i < len; i++) {
      var blue = Z_readUInt8(thisBM.buffer, thisBM.pos++)
      var green = Z_readUInt8(thisBM.buffer, thisBM.pos++)
      var red = Z_readUInt8(thisBM.buffer, thisBM.pos++)
      var quad = Z_readUInt8(thisBM.buffer, thisBM.pos++)
      thisBM.palette[i] = {
        red: red,
        green: green,
        blue: blue,
        quad: quad,
      }
    }
  }
  if (thisBM.height < 0) {
    thisBM.height *= -1
    thisBM.bottom_up = false
  }
}
Z_parseRGBA = function(thisBM) {
  var bitn = 'bit' + thisBM.bitPP
  var len = thisBM.width * thisBM.height * 4
  thisBM.data = new Array(len)
  switch (bitn) {
    case 'bit1':
      Z_bit1(thisBM)
      break
    case 'bit4':
      Z_bit4(thisBM)
      break
    case 'bit8':
      Z_bit8(thisBM)
      break
    case 'bit16':
      Z_bit16(thisBM)
      break
    case 'bit24':
      Z_bit24(thisBM)
      break
    case 'bit32':
      Z_bit32(thisBM)
      break
    default:
      throw Error('Unhandled format: ' + bitn)
  }
}

Z_bit1 = function(thisBM) {
  var xlen = Math.ceil(thisBM.width / 8)
  var mode = xlen % 4
  var y = thisBM.height >= 0 ? thisBM.height - 1 : -thisBM.height
  for (var y = thisBM.height - 1; y >= 0; y--) {
    var line = thisBM.bottom_up ? y : thisBM.height - 1 - y
    for (var x = 0; x < xlen; x++) {
      var b = Z_readUInt8(thisBM.buffer, thisBM.pos++)
      var location = line * thisBM.width * 4 + x * 8 * 4
      for (var i = 0; i < 8; i++) {
        if (x * 8 + i < thisBM.width) {
          var rgb = thisBM.palette[(b >> (7 - i)) & 0x1]

          thisBM.data[location + i * 4] = 0
          thisBM.data[location + i * 4 + 1] = rgb.blue
          thisBM.data[location + i * 4 + 2] = rgb.green
          thisBM.data[location + i * 4 + 3] = rgb.red
        } else {
          break
        }
      }
    }

    if (mode != 0) {
      thisBM.pos += 4 - mode
    }
  }
}

Z_bit4 = function(thisBM) {
  //RLE-4
  if (thisBM.compress == 2) {
    thisBM.data.fill(0xff)

    var location = 0
    var lines = thisBM.bottom_up ? thisBM.height - 1 : 0
    var low_nibble = false //for all count of pixel

    while (location < thisBM.data.length) {
      var a = Z_readUInt8(thisBM.buffer, thisBM.pos++)
      var b = Z_readUInt8(thisBM.buffer, thisBM.pos++)
      //absolute mode
      if (a == 0) {
        if (b == 0) {
          //line end
          if (thisBM.bottom_up) {
            lines--
          } else {
            lines++
          }
          location = lines * thisBM.width * 4
          low_nibble = false
          continue
        } else if (b == 1) {
          //image end
          break
        } else if (b == 2) {
          //offset x,y
          var x = Z_readUInt8(thisBM.buffer, thisBM.pos++)
          var y = Z_readUInt8(thisBM.buffer, thisBM.pos++)
          if (thisBM.bottom_up) {
            lines -= y
          } else {
            lines += y
          }

          location += y * thisBM.width * 4 + x * 4
        } else {
          var c = Z_readUInt8(thisBM.buffer, thisBM.pos++)
          for (var i = 0; i < b; i++) {
            if (low_nibble) {
              setPixelData(thisBM, c & 0x0f)
            } else {
              setPixelData(thisBM, (c & 0xf0) >> 4)
            }

            if (i & 1 && i + 1 < b) {
              c = Z_readUInt8(thisBM.buffer, thisBM.pos++)
            }

            low_nibble = !low_nibble
          }

          if ((((b + 1) >> 1) & 1) == 1) {
            thisBM.pos++
          }
        }
      } else {
        //encoded mode
        for (var i = 0; i < a; i++) {
          if (low_nibble) {
            setPixelData(thisBM, b & 0x0f)
          } else {
            setPixelData(thisBM, (b & 0xf0) >> 4)
          }
          low_nibble = !low_nibble
        }
      }
    }

    function setPixelData(thisBM, rgbIndex) {
      var rgb = thisBM.palette[rgbIndex]
      thisBM.data[location] = 0
      thisBM.data[location + 1] = rgb.blue
      thisBM.data[location + 2] = rgb.green
      thisBM.data[location + 3] = rgb.red
      location += 4
    }
  } else {
    var xlen = Math.ceil(thisBM.width / 2)
    var mode = xlen % 4
    for (var y = thisBM.height - 1; y >= 0; y--) {
      var line = thisBM.bottom_up ? y : thisBM.height - 1 - y
      for (var x = 0; x < xlen; x++) {
        var b = Z_readUInt8(thisBM.buffer, thisBM.pos++)
        var location = line * thisBM.width * 4 + x * 2 * 4

        var before = b >> 4
        var after = b & 0x0f

        var rgb = thisBM.palette[before]
        thisBM.data[location] = 0
        thisBM.data[location + 1] = rgb.blue
        thisBM.data[location + 2] = rgb.green
        thisBM.data[location + 3] = rgb.red

        if (x * 2 + 1 >= thisBM.width) break

        rgb = thisBM.palette[after]

        thisBM.data[location + 4] = 0
        thisBM.data[location + 4 + 1] = rgb.blue
        thisBM.data[location + 4 + 2] = rgb.green
        thisBM.data[location + 4 + 3] = rgb.red
      }

      if (mode != 0) {
        thisBM.pos += 4 - mode
      }
    }
  }
}

Z_bit8 = function(thisBM) {
  //RLE-8
  if (thisBM.compress == 1) {
    thisBM.data.fill(0xff)

    var location = 0
    var lines = thisBM.bottom_up ? thisBM.height - 1 : 0

    while (location < thisBM.data.length) {
      var a = Z_readUInt8(thisBM.buffer, thisBM.pos++)
      var b = Z_readUInt8(thisBM.buffer, thisBM.pos++)
      //absolute mode
      if (a == 0) {
        if (b == 0) {
          //line end
          if (thisBM.bottom_up) {
            lines--
          } else {
            lines++
          }
          location = lines * thisBM.width * 4
          continue
        } else if (b == 1) {
          //image end
          break
        } else if (b == 2) {
          //offset x,y
          var x = Z_readUInt8(thisBM.buffer, thisBM.pos++)
          var y = Z_readUInt8(thisBM.buffer, thisBM.pos++)
          if (thisBM.bottom_up) {
            lines -= y
          } else {
            lines += y
          }

          location += y * thisBM.width * 4 + x * 4
        } else {
          for (var i = 0; i < b; i++) {
            var c = Z_readUInt8(thisBM.buffer, thisBM.pos++)
            setPixelData(thisBM, c)
          }
          if (b & (1 == 1)) {
            thisBM.pos++
          }
        }
      } else {
        //encoded mode
        for (var i = 0; i < a; i++) {
          setPixelData(thisBM, b)
        }
      }
    }

    function setPixelData(thisBM, rgbIndex) {
      var rgb = thisBM.palette[rgbIndex]
      thisBM.data[location] = 0
      thisBM.data[location + 1] = rgb.blue
      thisBM.data[location + 2] = rgb.green
      thisBM.data[location + 3] = rgb.red
      location += 4
    }
  } else {
    var mode = thisBM.width % 4
    for (var y = thisBM.height - 1; y >= 0; y--) {
      var line = thisBM.bottom_up ? y : thisBM.height - 1 - y
      for (var x = 0; x < thisBM.width; x++) {
        var b = Z_readUInt8(thisBM.buffer, thisBM.pos++)
        var location = line * thisBM.width * 4 + x * 4
        if (b < thisBM.palette.length) {
          var rgb = thisBM.palette[b]

          thisBM.data[location] = 0
          thisBM.data[location + 1] = rgb.blue
          thisBM.data[location + 2] = rgb.green
          thisBM.data[location + 3] = rgb.red
        } else {
          thisBM.data[location] = 0
          thisBM.data[location + 1] = 0xff
          thisBM.data[location + 2] = 0xff
          thisBM.data[location + 3] = 0xff
        }
      }
      if (mode != 0) {
        thisBM.pos += 4 - mode
      }
    }
  }
}

Z_bit15 = function(thisBM) {
  var dif_w = thisBM.width % 3
  var _11111 = parseInt('11111', 2),
    _1_5 = _11111
  for (var y = thisBM.height - 1; y >= 0; y--) {
    var line = thisBM.bottom_up ? y : thisBM.height - 1 - y
    for (var x = 0; x < thisBM.width; x++) {
      var B = Z_readUInt16LE(thisBM.buffer, thisBM.pos)
      thisBM.pos += 2
      var blue = (((B & _1_5) / _1_5) * 255) | 0
      var green = ((((B >> 5) & _1_5) / _1_5) * 255) | 0
      var red = ((((B >> 10) & _1_5) / _1_5) * 255) | 0
      var alpha = B >> 15 ? 0xff : 0x00

      var location = line * thisBM.width * 4 + x * 4

      thisBM.data[location] = alpha
      thisBM.data[location + 1] = blue
      thisBM.data[location + 2] = green
      thisBM.data[location + 3] = red
    }
    //skip extra bytes
    thisBM.pos += dif_w
  }
}

Z_bit16 = function(thisBM) {
  var dif_w = (thisBM.width % 2) * 2
  //default xrgb555
  thisBM.maskRed = 0x7c00
  thisBM.maskGreen = 0x3e0
  thisBM.maskBlue = 0x1f
  thisBM.mask0 = 0

  if (thisBM.compress == 3) {
    thisBM.maskRed = Z_readUInt32LE(thisBM.buffer, thisBM.pos)
    thisBM.pos += 4
    thisBM.maskGreen = Z_readUInt32LE(thisBM.buffer, thisBM.pos)
    thisBM.pos += 4
    thisBM.maskBlue = Z_readUInt32LE(thisBM.buffer, thisBM.pos)
    thisBM.pos += 4
    thisBM.mask0 = Z_readUInt32LE(thisBM.buffer, thisBM.pos)
    thisBM.pos += 4
  }

  var ns = [0, 0, 0]
  for (var i = 0; i < 16; i++) {
    if ((thisBM.maskRed >> i) & 0x01) ns[0]++
    if ((thisBM.maskGreen >> i) & 0x01) ns[1]++
    if ((thisBM.maskBlue >> i) & 0x01) ns[2]++
  }
  ns[1] += ns[0]
  ns[2] += ns[1]
  ns[0] = 8 - ns[0]
  ns[1] -= 8
  ns[2] -= 8

  for (var y = thisBM.height - 1; y >= 0; y--) {
    var line = thisBM.bottom_up ? y : thisBM.height - 1 - y
    for (var x = 0; x < thisBM.width; x++) {
      var B = Z_readUInt16LE(thisBM.buffer, thisBM.pos)
      thisBM.pos += 2

      var blue = (B & thisBM.maskBlue) << ns[0]
      var green = (B & thisBM.maskGreen) >> ns[1]
      var red = (B & thisBM.maskRed) >> ns[2]

      var location = line * thisBM.width * 4 + x * 4

      thisBM.data[location] = 0
      thisBM.data[location + 1] = blue
      thisBM.data[location + 2] = green
      thisBM.data[location + 3] = red
    }
    //skip extra bytes
    thisBM.pos += dif_w
  }
}

Z_bit24 = function(thisBM) {
  for (var y = thisBM.height - 1; y >= 0; y--) {
    var line = thisBM.bottom_up ? y : thisBM.height - 1 - y
    for (var x = 0; x < thisBM.width; x++) {
      //Little Endian rgb
      var blue = Z_readUInt8(thisBM.buffer, thisBM.pos++)
      var green = Z_readUInt8(thisBM.buffer, thisBM.pos++)
      var red = Z_readUInt8(thisBM.buffer, thisBM.pos++)
      var location = line * thisBM.width * 4 + x * 4
      thisBM.data[location] = 0
      thisBM.data[location + 1] = blue
      thisBM.data[location + 2] = green
      thisBM.data[location + 3] = red
    }
    //skip extra bytes
    thisBM.pos += thisBM.width % 4
  }
}

/**
 * add 32bit decode func
 * @author soubok
 */
Z_bit32 = function(thisBM) {
  //BI_BITFIELDS
  if (thisBM.compress == 3) {
    thisBM.maskRed = Z_readUInt32LE(thisBM.buffer, thisBM.pos)
    thisBM.pos += 4
    thisBM.maskGreen = Z_readUInt32LE(thisBM.buffer, thisBM.pos)
    thisBM.pos += 4
    thisBM.maskBlue = Z_readUInt32LE(thisBM.buffer, thisBM.pos)
    thisBM.pos += 4
    thisBM.mask0 = Z_readUInt32LE(thisBM.buffer, thisBM.pos)
    thisBM.pos += 4
    for (var y = thisBM.height - 1; y >= 0; y--) {
      var line = thisBM.bottom_up ? y : thisBM.height - 1 - y
      for (var x = 0; x < thisBM.width; x++) {
        //Little Endian rgba
        var alpha = Z_readUInt8(thisBM.buffer, thisBM.pos++)
        var blue = Z_readUInt8(thisBM.buffer, thisBM.pos++)
        var green = Z_readUInt8(thisBM.buffer, thisBM.pos++)
        var red = Z_readUInt8(thisBM.buffer, thisBM.pos++)
        var location = line * thisBM.width * 4 + x * 4
        thisBM.data[location] = alpha
        thisBM.data[location + 1] = blue
        thisBM.data[location + 2] = green
        thisBM.data[location + 3] = red
      }
    }
  } else {
    for (var y = thisBM.height - 1; y >= 0; y--) {
      var line = thisBM.bottom_up ? y : thisBM.height - 1 - y
      for (var x = 0; x < thisBM.width; x++) {
        //Little Endian argb
        var blue = Z_readUInt8(thisBM.buffer, thisBM.pos++)
        var green = Z_readUInt8(thisBM.buffer, thisBM.pos++)
        var red = Z_readUInt8(thisBM.buffer, thisBM.pos++)
        var alpha = Z_readUInt8(thisBM.buffer, thisBM.pos++)
        var location = line * thisBM.width * 4 + x * 4
        thisBM.data[location] = alpha
        thisBM.data[location + 1] = blue
        thisBM.data[location + 2] = green
        thisBM.data[location + 3] = red
      }
    }
  }
}

BmpDecoder.prototype.getData = function() {
  return thisBM.data
}

const bmp_decode = function(bmpData) {
  var decoder = new BmpDecoder(bmpData)
  return decoder
}

/**
 *
 * BMP format encoder,encode 24bit BMP
 * Not support quality compression
 *
 */

const ENC_BPP = 3

function BmpEncoder(imgData) {
  var thisBM = {}
  thisBM.buffer = imgData.data
  thisBM.width = imgData.width
  thisBM.height = imgData.height
  thisBM.extraBytes = thisBM.width % 4
  thisBM.rgbSize = thisBM.height * (ENC_BPP * thisBM.width + thisBM.extraBytes)
  thisBM.headerInfoSize = 40

  thisBM.data = []
  /******************header***********************/
  thisBM.flag = 'BM'
  thisBM.reserved = 0
  thisBM.offset = 54
  thisBM.fileSize = thisBM.rgbSize + thisBM.offset
  thisBM.planes = 1
  thisBM.bitPP = 24
  thisBM.compress = 0
  thisBM.hr = 0
  thisBM.vr = 0
  thisBM.colors = 0
  thisBM.importantColors = 0

  return thisBM
}

function X_writeUInt8(buf, value, pos) {
  buf[pos] = value
}

function X_writeUInt16LE(buf, value, pos) {
  const tmpVal = value & 0xffff
  buf[pos] = tmpVal & 0xff
  buf[pos + 1] = (tmpVal >> 8) & 0xff
}

function X_writeUInt32LE(buf, value, pos) {
  X_writeUInt16LE(buf, value & 0xffff, pos)
  X_writeUInt16LE(buf, (value >> 16) & 0xffff, pos + 2)
}

const X_writeInt32LE = X_writeUInt32LE

function X_encode(thisBM) {
  var tempBuffer = new Uint8Array(new ArrayBuffer(thisBM.offset + thisBM.rgbSize))
  X_writeUInt8(tempBuffer, 'B'.charCodeAt(0), 0x00)
  X_writeUInt8(tempBuffer, 'M'.charCodeAt(0), 0x01)
  X_writeUInt32LE(tempBuffer, thisBM.fileSize, 0x02)
  X_writeUInt32LE(tempBuffer, thisBM.reserved, 0x06)
  X_writeUInt32LE(tempBuffer, thisBM.offset, 0x0a)
  X_writeUInt32LE(tempBuffer, thisBM.headerInfoSize, 0x0e)
  X_writeUInt32LE(tempBuffer, thisBM.width, 0x12)
  X_writeInt32LE(tempBuffer, thisBM.height, 0x16)
  X_writeUInt16LE(tempBuffer, thisBM.planes, 0x1a)
  X_writeUInt16LE(tempBuffer, thisBM.bitPP, 0x1c)
  X_writeUInt32LE(tempBuffer, thisBM.compress, 0x1e)
  X_writeUInt32LE(tempBuffer, thisBM.rgbSize, 0x22)
  X_writeUInt32LE(tempBuffer, thisBM.hr, 0x26)
  X_writeUInt32LE(tempBuffer, thisBM.vr, 0x2a)
  X_writeUInt32LE(tempBuffer, thisBM.colors, 0x2e)
  X_writeUInt32LE(tempBuffer, thisBM.importantColors, 0x32)

  const dataStartPos = 0x32 + 4

  var i = 0
  
  var rowBytes = ENC_BPP * thisBM.width + thisBM.extraBytes
  print(16 * 3, ' = ', rowBytes)

  var y = 0, p =0
  var x = 0
  for ( y = 0; y < thisBM.height; y++) {
    for ( x = 0; x < thisBM.width; x++) {
       p = dataStartPos + y * rowBytes + x * ENC_BPP
      const cA = thisBM.buffer[i++]
      const cB = thisBM.buffer[i++]
      const cG = thisBM.buffer[i++]
      const cR = thisBM.buffer[i++]

      tempBuffer[p] = cB
      tempBuffer[p + 1] = cG
      tempBuffer[p + 2] = cR
    }
    if (thisBM.extraBytes > 0) {
      var fillOffset = dataStartPos + y * rowBytes + thisBM.width * 3
      tempBuffer.fill(0, fillOffset, fillOffset + thisBM.extraBytes)
    }
  }
  print(`P:${p} X:${x} Y:${y} ${ thisBM.extraBytes} filesize:${thisBM.offset + thisBM.rgbSize}`)
  print(`lenght: ${tempBuffer.length}`)
  return tempBuffer
}

const bmp_encode = function(bmpObject, quality) {
  if (typeof quality === 'undefined') quality = 100
  var newBmpObject = new BmpEncoder(bmpObject)
  var bmpBinaryString = X_encode(newBmpObject)
  return {
    data: bmpBinaryString,
    width: newBmpObject.width,
    height: newBmpObject.height,
  }
}
