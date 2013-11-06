/*
 * Author: Alex Kocharin <alex@kocharin.ru>
 * GIT: https://github.com/rlidwka/json5-utils
 * License: WTFPL, grab your copy here: http://www.wtfpl.net/txt/copying/
 */

var Uni = require('./unicode')

// Fix Function#name on browsers that do not support it (IE)
// http://stackoverflow.com/questions/6903762/function-name-not-supported-in-ie
if (!(function f(){}).name) {
	Object.defineProperty(Function.prototype, 'name', {
		get: function() {
			var name = this.toString().match(/^\s*function\s*(\S*)\s*\(/)[1]
			// For better performance only parse once, and then cache the
			// result through a new accessor for repeated access.
			Object.defineProperty(this, 'name', { value: name })
			return name
		}
	})
}

var special_chars = {
	0: '\\0', // this is not an octal literal
	8: '\\b',
	9: '\\t',
	10: '\\n',
	11: '\\v',
	12: '\\f',
	13: '\\r',
	92: '\\\\',
}

// for oddballs
var hasOwnProperty = Object.prototype.hasOwnProperty

// some people escape those, so I'd copy this to be safe
var escapable = /[\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/

function _stringify(object, options, indentLvl) {
	var opt_json = options.mode === 'json'
	/*
	 * Opinionated decision warning:
	 *
	 * Objects are serialized in the following form:
	 * { type: 'Class', data: DATA }
	 *
	 * Class is supposed to be a function, and new Class(DATA) is
	 * supposed to be equivalent to the original value
	 */
	/*function custom_type() {
		return stringify({
			type: object.constructor.name,
			data: object.toString()
		})
	}*/

	// if add, it's an internal indentation, so we add 1 level and a eol
	// if !add, it's an ending indentation, so we just indent
	function indent(str, add) {
		if (!options.indent) return str
		var result = ''
		var count = indentLvl + (add || 0)
		for (var i=0; i<count; i++) result += options.indent
		return result + str + (add ? '\n' : '')
	}

	function _stringify_key(key) {
		if (options.quote_keys) return _stringify_str(key)
		if (String(Number(key)) == key && key[0] != '-') return key
		if (key == '') return _stringify_str(key)

		var result = ''
		for (var i=0; i<key.length; i++) {
			if (i > 0) {
				if (!Uni.isIdentifierPart(key[i]))
					return _stringify_str(key)

			} else {
				if (!Uni.isIdentifierStart(key[i]))
					return _stringify_str(key)
			}

			var chr = key.charCodeAt(i)

			if (options.ascii) {
				if (chr < 0x80) {
					result += key[i]

				} else {
					result += '\\u' + ('0000' + chr.toString(16)).slice(-4)
				}

			} else {
				if (escapable.exec(key[i])) {
					result += '\\u' + ('0000' + chr.toString(16)).slice(-4)

				} else {
					result += key[i]
				}
			}
		}

		return result
	}

	function _stringify_str(key) {
		var quote = options.quote
		var quoteChr = quote.charCodeAt(0)

		var result = ''
		for (var i=0; i<key.length; i++) {
			var chr = key.charCodeAt(i)

			if (chr < 0x10) {
				if (chr === 0 && !opt_json) {
					result += '\\0'
				} else if (chr >= 8 && chr <= 13 && (!opt_json || chr !== 11)) {
					result += special_chars[chr]
				} else if (!opt_json) {
					result += '\\x0' + chr.toString(16)
				} else {
					result += '\\u000' + chr.toString(16)
				}

			} else if (chr < 0x20) {
				if (!opt_json) {
					result += '\\x' + chr.toString(16)
				} else {
					result += '\\u00' + chr.toString(16)
				}

			} else if (chr >= 0x20 && chr < 0x80) {
				// ascii range
				if (chr === 47 && i && key[i-1] === '<') {
					// escaping slashes in </script>
					result += '\\' + key[i]

				} else if (chr === 92) {
					result += '\\\\'

				} else if (chr === quoteChr) {
					result += '\\' + quote

				} else {
					result += key[i]
				}

			} else if (options.ascii || Uni.isLineTerminator(key[i]) || escapable.exec(key[i])) {
				if (chr < 0x100) {
					if (!opt_json) {
						result += '\\x' + chr.toString(16)
					} else {
						result += '\\u00' + chr.toString(16)
					}

				} else if (chr < 0x1000) {
					result += '\\u0' + chr.toString(16)

				} else if (chr < 0x10000) {
					result += '\\u' + chr.toString(16)

				} else {
					throw new Error('weird codepoint')
				}
			} else {
				result += key[i]
			}
		}
		return quote + result + quote
	}

	function _stringify_object() {
		if (object === null) return 'null'

		if (Array.isArray(object)) {
			braces = '[]'
			for (var i=0; i<object.length; i++) {
				var t = _stringify(object[i], options, indentLvl+1)
				if (t === undefined) t = 'null'
				len += t.length + 2
				result.push(t + ',')
			}

		} else {
			braces = '{}'
			for (var key in object) {
				if (!hasOwnProperty.call(object, key)) continue
				var t = _stringify(object[key], options, indentLvl+1)
				if (t !== undefined) {
					t = _stringify_key(key) + ':' + (options.indent ? ' ' : '') + t + ','
					len += t.length + 1
					result.push(t)
				}
			}
		}

		// objects shorter than 30 characters are always inlined
		// objects longer than 60 characters are always splitted to multiple lines
		// anything in the middle depends on indentation level
		if (options.indent && (len > 68 - indentLvl * 4 || len > 48) ) {
			// remove trailing comma in multiline if asked to
			if (options.no_trailing_comma && result.length) {
				result[result.length-1] = result[result.length-1].substring(0, result[result.length-1].length-1)
			}

			var innerStuff = result.map(function(x) {return indent(x, 1)}).join('')
			return braces[0]
				  + (options.indent ? '\n' : '')
				  + innerStuff
				  + indent(braces[1])
		} else {
			// always remove trailing comma in one-lined arrays
			if (result.length) {
				result[result.length-1] = result[result.length-1].substring(0, result[result.length-1].length-1)
			}

			var innerStuff = result.join(options.indent ? ' ' : '')
			return braces[0]
				  + innerStuff
				  + braces[1]
		}
	}

	function _stringify_nonobject(object) {
		switch(typeof(object)) {
			case 'string':
				return _stringify_str(object)

			case 'number':
				if (object === 0 && 1/object < 0) {
					// Opinionated decision warning:
					//
					// I want cross-platform negative zero in all js engines
					// I know they're equal, but why lose that tiny bit of
					// information needlessly?
					return '-0'
				}
				if (options.mode === 'json' && !Number.isFinite(object)) {
					// json don't support infinity (= sucks)
					return 'null'
				}
				return object.toString()

			case 'boolean':
				return object.toString()

			case 'undefined':
				return undefined
			
			case 'function':
//				return custom_type()

			default:
				// fallback for something weird
				return JSON.stringify(object)
		}
	}

	if (typeof(object) === 'object') {
		if (object === null) return 'null'

		/*
		 * Opinionated decision warning:
		 *
		 * toJSON must be a function of the prototype,
		 * otherwise we have no way of knowing if it's intended
		 * to be executed by the programmer or not
		 */
		/*if (!localopts.no_tojson) {
			var is_custom = false
			if (typeof(object.toJSON5) === 'function'
					 && !object.hasOwnProperty('toJSON5')) {
				object = object.toJSON5()
				is_custom = true

			} else if (typeof(object.toJSON) === 'function'
					 && !object.hasOwnProperty('toJSON')) {
				object = object.toJSON()
				is_custom = true

			}

			if (is_custom) {
				if (!(typeof(object) === 'object' && object !== null)) {
					object = {
						type: object.constructor.name,
						data: object
					}
				}
				return stringify(object, options, {no_tojson: true})
			}
		}*/

		var result = []
		var len = 0
		var braces

		if (object.constructor === Number || object.constructor === Boolean || object.constructor === String) {
			object = object.valueOf()
			return _stringify_nonobject(object)
		} else if (object.constructor === Date) {
			// only until we can't do better
			return _stringify_nonobject(object.toISOString())
		}		

		return _stringify_object(object)
	} else {
		return _stringify_nonobject(object)
	}
}

module.exports.stringify = function stringify(object, options) {
	if (options == null) options = {}
	if (options.indent == null) options.indent = '\t'
	if (options.quote == null) options.quote = "'"
	if (options.ascii == null) options.ascii = false
	if (options.mode == null) options.mode = 'simple'

	if (options.mode === 'json') {
		// json only supports double quotes (= sucks)
		options.quote = '"'

		// json don't support trailing commas (= sucks)
		options.no_trailing_comma = true

		// json don't support unquoted property names (= sucks)
		options.quote_keys = true
	}

	// gap is capped at 10 characters
	if (typeof(options.indent) === 'number') {
		if (options.indent >= 0 && options.indent < 11) {
			options.indent = Array(~~options.indent+1).join(' ')
		}
	} else if (typeof(options.indent) === 'string') {
		options.indent = options.indent.substr(0, 10)
	}

	return _stringify(object, options, 0)
}
