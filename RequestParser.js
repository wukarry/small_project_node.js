const Events = require('events')

class RequestParser extends Events {
  _state = this._read_request_line;
  _cache = null;

  _message = {
    request: {
      method: '',
      path: '',
      version: '',
      headers: [],
      body: Buffer.from('')
    },
    response: {
      status: 0,
      headers: [],
      body: Buffer.from('')
    }
  };

  append (buffer) {
    for (let offset = 0; offset < buffer.length; offset++) {
      this._state = this._state(buffer[offset]);
    }
  }

  _read_request_line (char) {
    if (!this._cache) {
      // Method, URI, Version, CR LF
      // [pointer, Method, URI, Version, CRFlage]
      this._cache = [1, '' ,'' ,'', false];
    }

    if (char === 0x20) { // === SP
      this._cache[0]++;
    } else if (char === 0x0D) { // === CR
      this._cache[4] = true;
    } else if (char === 0x0A && this._cache[4]) { // === LF
      this._message.request.method = this._cache[1];
      this._message.request.path = this._cache[2];
      this._message.request.version = this._cache[3];
      this._cache = null;
      return this._read_header_line;
    } else {
      this._cache[this._cache[0]] += String.fromCharCode(char);
    }

    return this._read_request_line;
  }

  _read_header_line (char) {
    if (!this._cache) {
      // Token: content CRLF
      // [pointer, token, content, CRFlage]
      this._cache = [1, '' ,'' ,false];
    }

    if (char === 0x3A) { // ===:
      this._cache[0]++;
    } else if (char === 0x0D) { // === CR
      this._cache[3] = true;
    } else if (char === 0x0A && this._cache[3]) { // === LF
      if (this._cache[1]) {
        this._message.request.headers.push({
          key: this._cache[1],
          value: this._cache[2]
        });
        this._cache = null;
        return this._read_header_line;
      } else {
        const contentLengthHeaders = this._message.request.headers.filter(
          item => item.key === 'Content-Length'
        );

        if (
          contentLengthHeaders &&
          contentLengthHeaders[0] &&
          contentLengthHeaders[0].value > 0
        ) {
          this._cache = null;
          return this._read_body;
        }

        this._cache = null;
        return this._send_finish_event();
      }
    } else {
      this._cache[this._cache[0]] += String.fromCharCode(char);
    }

    return this._read_header_line;
  }

  _read_body (char) {
    const contentLength = this._message.request.headers.filter(
      item => item.key === 'Content-Length'
    )[0].value;

    if (!this._cache) {
      // Token: content CRLF
      // [content-length, bytes-read, content]
      this._cache = [
        parseInt(contentLength) ,
        0,
        new Uint8Array(parseInt(contentLength))
      ];
    }

    if (this._cache[1] < this._cache[0]) {
      this._cache[2][this._cache[1]] = char;
      this._cache[1]++;

      if (this._cache[1] === this._cache[0]) {
        this._message.request.body = Buffer.from(this._cache[2]);
        return this._send_finish_event();
      }
    }

    return this._read_body;
  }

  _send_finish_event (char) {
    this.emit('finish', this._message);
    return this._end(char)
  }

  _end (char) {
    return this._end;
  }
}

module.exports = RequestParser;
