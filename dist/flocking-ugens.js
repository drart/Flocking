/*! Flocking 0.2.0-dev, Copyright 2015 Colin Clark | flockingjs.org */

/*
 * Flocking Core Unit Generators
 * http://github.com/colinbdclark/flocking
 *
 * Copyright 2011-2014, Colin Clark
 * Dual licensed under the MIT and GPL Version 2 licenses.
 */

/*global require*/
/*jshint white: false, newcap: true, regexp: true, browser: true,
    forin: false, nomen: true, bitwise: false, maxerr: 100,
    indent: 4, plusplus: false, curly: true, eqeqeq: true,
    freeze: true, latedef: true, noarg: true, nonew: true, quotmark: double, undef: true,
    unused: true, strict: true, asi: false, boss: false, evil: false, expr: false,
    funcscope: false*/

var fluid = fluid || require("infusion"),
    flock = fluid.registerNamespace("flock");

(function () {
    "use strict";

    var $ = fluid.registerNamespace("jQuery");

    flock.isUGen = function (obj) {
        return obj && obj.tags && obj.tags.indexOf("flock.ugen") > -1;
    };

    // TODO: Check API; write unit tests.
    flock.aliasUGen = function (sourcePath, aliasName, inputDefaults, defaultOptions) {
        var root = flock.get(sourcePath);
        flock.set(root, aliasName, function (inputs, output, options) {
            options = $.extend(true, {}, defaultOptions, options);
            return root(inputs, output, options);
        });
        fluid.defaults(sourcePath + "." + aliasName, inputDefaults);
    };

    // TODO: Check API; write unit tests.
    flock.aliasUGens = function (sourcePath, aliasesSpec) {
        var aliasName,
            settings;

        for (aliasName in aliasesSpec) {
            settings = aliasesSpec[aliasName];
            flock.aliasUGen(sourcePath, aliasName, {inputs: settings.inputDefaults}, settings.options);
        }
    };

    flock.krMul = function (numSamps, output, mulInput) {
        var mul = mulInput.output[0],
            i;

        for (i = 0; i < numSamps; i++) {
            output[i] = output[i] * mul;
        }
    };

    flock.mul = function (numSamps, output, mulInput) {
        var mul = mulInput.output,
            i;

        for (i = 0; i < numSamps; i++) {
            output[i] = output[i] * mul[i];
        }
    };

    flock.krAdd = function (numSamps, output, mulInput, addInput) {
        var add = addInput.output[0],
            i;

        for (i = 0; i < numSamps; i++) {
            output[i] = output[i] + add;
        }
    };

    flock.add = function (numSamps, output, mulInput, addInput) {
        var add = addInput.output,
            i;

        for (i = 0; i < numSamps; i++) {
            output[i] = output[i] + add[i];
        }
    };

    flock.krMulAdd = function (numSamps, output, mulInput, addInput) {
        var mul = mulInput.output[0],
            add = addInput.output,
            i;

        for (i = 0; i < numSamps; i++) {
            output[i] = output[i] * mul + add[i];
        }
    };

    flock.mulKrAdd = function (numSamps, output, mulInput, addInput) {
        var mul = mulInput.output,
            add = addInput.output[0],
            i;

        for (i = 0; i < numSamps; i++) {
            output[i] = output[i] * mul[i] + add;
        }
    };

    flock.krMulKrAdd = function (numSamps, output, mulInput, addInput) {
        var mul = mulInput.output[0],
            add = addInput.output[0],
            i;

        for (i = 0; i < numSamps; i++) {
            output[i] = output[i] * mul + add;
        }
    };

    flock.mulAdd = function (numSamps, output, mulInput, addInput) {
        var mul = mulInput.output,
            add = addInput.output,
            i;

        for (i = 0; i < numSamps; i++) {
            output[i] = output[i] * mul[i] + add[i];
        }
    };

    flock.onMulAddInputChanged = function (that) {
        var mul = that.inputs.mul,
            add = that.inputs.add,
            fn;

        // If we have no mul or add inputs, bail immediately.
        if (!mul && !add) {
            that.mulAdd = flock.noOp;
            return;
        }

        if (!mul) { // Only add.
            fn = add.rate !== flock.rates.AUDIO ? flock.krAdd : flock.add;
        } else if (!add) { // Only mul.
            fn = mul.rate !== flock.rates.AUDIO ? flock.krMul : flock.mul;
        } else { // Both mul and add.
            fn = mul.rate !== flock.rates.AUDIO ?
                (add.rate !== flock.rates.AUDIO ? flock.krMulKrAdd : flock.krMulAdd) :
                (add.rate !== flock.rates.AUDIO ? flock.mulKrAdd : flock.mulAdd);
        }

        that.mulAdd = function (numSamps) {
            fn(numSamps, that.output, mul, add);
        };
    };


    flock.ugen = function (inputs, output, options) {
        options = options || {};

        var that = {
            rate: options.rate || flock.rates.AUDIO,
            inputs: inputs,
            output: output,
            options: options,
            model: options.model || {
                unscaledValue: 0.0,
                value: 0.0
            },
            multiInputs: {},
            tags: ["flock.ugen"]
        };
        that.lastOutputIdx = that.output.length - 1;

        that.get = function (path) {
            return flock.input.get(that.inputs, path);
        };

        /**
         * Sets the value of the input at the specified path.
         *
         * @param {String} path the inputs's path relative to this ugen
         * @param {Number || UGenDef} val a scalar value (for Value ugens) or a UGenDef object
         * @return {UGen} the newly-created UGen that was set at the specified path
         */
        that.set = function (path, val) {
            return flock.input.set(that.inputs, path, val, that, function (ugenDef) {
                if (ugenDef === null || ugenDef === undefined) {
                    return;
                }

                return flock.parse.ugenDef(ugenDef, {
                    audioSettings: that.options.audioSettings,
                    buses: that.options.buses,
                    buffers: that.options.buffers
                });
            });
        };

        /**
         * Gets or sets the named unit generator input.
         *
         * @param {String} path the input path
         * @param {UGenDef} val [optional] a scalar value, ugenDef, or array of ugenDefs that will be assigned to the specified input name
         * @return {Number|UGen} a scalar value in the case of a value ugen, otherwise the ugen itself
         */
        that.input = function (path, val) {
            return !path ? undefined : typeof (path) === "string" ?
                arguments.length < 2 ? that.get(path) : that.set(path, val) :
                flock.isIterable(path) ? that.get(path) : that.set(path, val);
        };

        // TODO: Move this into a grade.
        that.calculateStrides = function () {
            var m = that.model,
                strideNames = that.options.strideInputs,
                inputs = that.inputs,
                i,
                name,
                input;

            m.strides = m.strides || {};

            if (!strideNames) {
                return;
            }

            for (i = 0; i < strideNames.length; i++) {
                name = strideNames[i];
                input = inputs[name];

                if (input) {
                    m.strides[name] = input.rate === flock.rates.AUDIO ? 1 : 0;
                } else {
                    fluid.log(fluid.logLevel.WARN, "An invalid input ('" +
                        name + "') was found on a unit generator: " + that);
                }
            }
        };

        that.collectMultiInputs = function () {
            var multiInputNames = that.options.multiInputNames,
                multiInputs = that.multiInputs,
                i,
                inputName,
                inputChannelCache,
                input;

            for (i = 0; i < multiInputNames.length; i++) {
                inputName = multiInputNames[i];
                inputChannelCache = multiInputs[inputName];

                if (!inputChannelCache) {
                    inputChannelCache = multiInputs[inputName] = [];
                } else {
                    // Clear the current array of buffers.
                    inputChannelCache.length = 0;
                }

                input = that.inputs[inputName];
                flock.ugen.collectMultiInputs(input, inputChannelCache);
            }
        };

        // Base onInputChanged() implementation.
        that.onInputChanged = function (inputName) {
            var multiInputNames = that.options.multiInputNames;

            flock.onMulAddInputChanged(that);
            if (that.options.strideInputs) {
                that.calculateStrides();
            }

            if (multiInputNames && (!inputName || multiInputNames.indexOf(inputName))) {
                that.collectMultiInputs();
            }
        };

        that.init = function () {
            var tags = fluid.makeArray(that.options.tags),
                m = that.model,
                o = that.options,
                i,
                s,
                valueDef;

            for (i = 0; i < tags.length; i++) {
                that.tags.push(tags[i]);
            }

            s = o.audioSettings = o.audioSettings || flock.environment.audioSystem.model;
            m.sampleRate = o.sampleRate || s.rates[that.rate];
            m.nyquistRate = m.sampleRate;
            m.blockSize = that.rate === flock.rates.AUDIO ? s.blockSize : 1;
            m.sampleDur = 1.0 / m.sampleRate;

            // Assigns an interpolator function to the UGen.
            // This is inactive by default, but can be used in custom gen() functions.
            that.interpolate = flock.interpolate.none;
            if (o.interpolation) {
                var fn = flock.interpolate[o.interpolation];
                if (!fn) {
                    fluid.log(fluid.logLevel.IMPORTANT,
                        "An invalid interpolation type of '" + o.interpolation +
                        "' was specified. Defaulting to none.");
                } else {
                    that.interpolate = fn;
                }
            }

            if (that.rate === flock.rates.DEMAND && that.inputs.freq) {
                valueDef = flock.parse.ugenDefForConstantValue(1.0);
                that.inputs.freq = flock.parse.ugenDef(valueDef);
            }
        };

        that.init();
        return that;
    };

    // The term "multi input" is a bit ambiguous,
    // but it provides a very light (and possibly poor) abstraction for two different cases:
    //   1. inputs that consist of an array of multiple unit generators
    //   2. inputs that consist of a single unit generator that has multiple ouput channels
    // In either case, each channel of each input unit generator will be gathered up into
    // an array of "proxy ugen" objects and keyed by the input name, making easy to iterate
    // over sources of input quickly.
    // A proxy ugen consists of a simple object conforming to this contract:
    //   {rate: <rate of parent ugen>, output: <Float32Array>}
    flock.ugen.collectMultiInputs = function (inputs, inputChannelCache) {
        if (!flock.isIterable(inputs)) {
            inputs = inputs = fluid.makeArray(inputs);
        }

        for (var i = 0; i < inputs.length; i++) {
            var input = inputs[i];
            flock.ugen.collectChannelsForInput(input, inputChannelCache);
        }

        return inputChannelCache;
    };

    flock.ugen.collectChannelsForInput = function (input, inputChannelCache) {
        var isMulti = flock.hasTag(input, "flock.ugen.multiChannelOutput"),
            channels = isMulti ? input.output : [input.output],
            i;

        for (i = 0; i < channels.length; i++) {
            inputChannelCache.push({
                rate: input.rate,
                output: channels[i]
            });
        }

        return inputChannelCache;
    };

    flock.ugen.lastOutputValue = function (numSamps, out) {
        return out[numSamps - 1];
    };


    /**
     * Mixes buffer-related functionality into a unit generator.
     */
    flock.ugen.buffer = function (that) {
        that.onBufferInputChanged = function (inputName) {
            var m = that.model,
                inputs = that.inputs;

            if (m.bufDef !== inputs.buffer || inputName === "buffer") {
                m.bufDef = inputs.buffer;
                flock.parse.bufferForDef(m.bufDef, that, flock.environment); // TODO: Shared enviro reference.
            }
        };

        that.setBuffer = function (bufDesc) {
            that.buffer = bufDesc;
            if (that.onBufferReady) {
                that.onBufferReady(bufDesc);
            }
        };

        that.initBuffer = function () {
            // Start with a zeroed buffer, since the buffer input may be loaded asynchronously.
            that.buffer = that.model.bufDef = flock.bufferDesc({
                format: {
                    sampleRate: that.options.audioSettings.rates.audio
                },
                data: {
                    channels: [new Float32Array(that.output.length)]
                }
            });
        };
    };


    flock.ugen.value = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.value = function () {
            return that.model.value;
        };

        that.dynamicGen = function (numSamps) {
            var out = that.output,
                m = that.model;

            for (var i = 0; i < numSamps; i++) {
                out[i] = m.unscaledValue;
            }

            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged = function () {
            var inputs = that.inputs,
                m = that.model;

            m.value = m.unscaledValue = inputs.value;

            if (that.rate !== "constant") {
                that.gen = that.dynamicGen;
            } else {
                that.gen = undefined;
            }

            flock.onMulAddInputChanged(that);
            that.dynamicGen(1);
        };

        that.onInputChanged();
        return that;
    };

    fluid.defaults("flock.ugen.value", {
        rate: "control",

        inputs: {
            value: 1.0,
            mul: null,
            add: null
        },

        ugenOptions: {
            model: {
                unscaledValue: 1.0,
                value: 1.0
            },

            tags: ["flock.ugen.valueType"]
        }
    });


    flock.ugen.silence = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.onInputChanged = function () {
            for (var i = 0; i < that.output.length; i++) {
                that.output[i] = 0.0;
            }
        };

        that.onInputChanged();
        return that;
    };

    fluid.defaults("flock.ugen.silence", {
        rate: "constant"
    });


    flock.ugen.passThrough = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                source = that.inputs.source.output,
                out = that.output,
                i,
                val;

            for (i = 0; i < source.length; i++) {
                out[i] = val = source[i];
            }

            for (; i < numSamps; i++) {
                out[i] = val = 0.0;
            }

            m.unscaledValue = val;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged();
        return that;
    };

    fluid.defaults("flock.ugen.passThrough", {
        rate: "audio",

        inputs: {
            source: null,
            mul: null,
            add: null
        }
    });

    
    flock.ugen.out = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        // TODO: Implement a "straight out" gen function for cases where the number
        // of sources matches the number of output buses (i.e. where no expansion is necessary).
        // TODO: This function is marked as unoptimized by the Chrome profiler.
        that.gen = function (numSamps) {
            var m = that.model,
                sources = that.multiInputs.sources,
                buses = that.options.buses,
                bufStart = that.inputs.bus.output[0],
                expand = that.inputs.expand.output[0],
                numSources,
                numOutputBuses,
                i,
                j,
                source,
                rate,
                bus,
                inc,
                outIdx;

            numSources = sources.length;
            numOutputBuses = Math.max(expand, numSources);

            if (numSources < 1) {
                return;
            }

            for (i = 0; i < numOutputBuses; i++) {
                source = sources[i % numSources];
                rate = source.rate;
                bus = buses[bufStart + i];
                inc = rate === flock.rates.AUDIO ? 1 : 0;
                outIdx = 0;

                for (j = 0; j < numSamps; j++, outIdx += inc) {
                    // TODO: Support control rate interpolation.
                    // TODO: Don't attempt to write to buses beyond the available number.
                    //       Provide an error at onInputChanged time if the unit generator is configured
                    //       with more sources than available buffers.
                    bus[j] = bus[j] + source.output[outIdx];
                }
            }

            // TODO: Consider how we should handle "value" when the number
            // of input channels for "sources" can be variable.
            // In the meantime, we just output the last source's last sample.
            m.value = m.unscaledValue = source.output[outIdx];
            that.mulAdd(numSamps); // TODO: Does this even work?
        };

        that.init = function () {
            that.sourceBuffers = [];
            that.onInputChanged();
        };

        that.init();
        return that;
    };

    fluid.defaults("flock.ugen.out", {
        rate: "audio",
        inputs: {
            sources: null,
            bus: 0,
            expand: 2
        },
        ugenOptions: {
            tags: ["flock.ugen.outputType"],
            multiInputNames: ["sources"]
        }
    });


    // Note: this unit generator currently only outputs values at control rate.
    // TODO: Unit tests.
    flock.ugen.valueOut = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.arraySourceGen = function () {
            var m = that.model,
                sources = that.inputs.sources,
                i;

            for (i = 0; i < sources.length; i++) {
                m.value[i] = sources[i].output[0];
            }
        };

        that.ugenSourceGen = function () {
            that.model.value = that.model.unscaledValue = that.inputs.sources.output[0];
        };

        that.onInputChanged = function () {
            var m = that.model,
                sources = that.inputs.sources;

            if (flock.isIterable(sources)) {
                that.gen = that.arraySourceGen;
                m.value = new Float32Array(sources.length);
                m.unscaledValue = m.value;
            } else {
                that.gen = that.ugenSourceGen;
            }
        };

        that.onInputChanged();
        return that;
    };

    fluid.defaults("flock.ugen.valueOut", {
        rate: "control",

        inputs: {
            sources: null
        },

        ugenOptions: {
            model: {
                unscaledValue: null,
                value: null
            },

            tags: ["flock.ugen.outputType", "flock.ugen.valueType"]
        }
    });


    // TODO: fix naming.
    // TODO: Make this a proper multiinput ugen.
    flock.ugen["in"] = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.singleBusGen = function (numSamps) {
            var m = that.model,
                out = that.output;

            flock.ugen.in.readBus(numSamps, out, that.inputs.bus,
                that.options.buses);

            m.unscaledValue = flock.ugen.lastOutputValue(numSamps, out);
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.multiBusGen = function (numSamps) {
            var m = that.model,
                busesInput = that.inputs.bus,
                enviroBuses = that.options.buses,
                out = that.output,
                i,
                j,
                busIdx,
                val;

            for (i = 0; i < numSamps; i++) {
                val = 0; // Clear previous output values before summing a new set.
                for (j = 0; j < busesInput.length; j++) {
                    busIdx = busesInput[j].output[0] | 0;
                    val += enviroBuses[busIdx][i];
                }
                out[i] = val;
            }

            m.unscaledValue = val;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged = function () {
            that.gen = flock.isIterable(that.inputs.bus) ? that.multiBusGen : that.singleBusGen;
            flock.onMulAddInputChanged(that);
        };

        that.onInputChanged();
        return that;
    };

    flock.ugen.in.readBus = function (numSamps, out, busInput, buses) {
        var busNum = busInput.output[0] | 0,
            bus = buses[busNum],
            i;

        for (i = 0; i < numSamps; i++) {
            out[i] = bus[i];
        }
    };

    fluid.defaults("flock.ugen.in", {
        rate: "audio",
        inputs: {
            bus: 0,
            mul: null,
            add: null
        }
    });


    flock.ugen.audioIn = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                out = that.output,
                bus = that.bus,
                i,
                val;

            for (i = 0; i < numSamps; i++) {
                out[i] = val = bus[i];
            }

            m.unscaledValue = val;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged = function () {
            flock.onMulAddInputChanged(that);
        };

        that.init = function () {
            // TODO: Direct reference to the shared environment.
            var busNum = flock.environment.audioStrategy.inputDeviceManager.openAudioDevice(options);
            that.bus = that.options.buses[busNum];
            that.onInputChanged();
        };

        that.init();
        return that;
    };

    fluid.defaults("flock.ugen.audioIn", {
        rate: "audio",
        inputs: {
            mul: null,
            add: null
        }
    });

}());
;/*
* Flocking Bandlimited UGens
* http://github.com/colinbdclark/flocking
*
* Copyright 2015, Colin Clark
* Dual licensed under the MIT and GPL Version 2 licenses.
*/

/*global require*/
/*jshint white: false, newcap: true, regexp: true, browser: true,
    forin: false, nomen: true, bitwise: false, maxerr: 100,
    indent: 4, plusplus: false, curly: true, eqeqeq: true,
    freeze: true, latedef: true, noarg: true, nonew: true, quotmark: double, undef: true,
    unused: true, strict: true, asi: false, boss: false, evil: false, expr: false,
    funcscope: false*/

var fluid = fluid || require("infusion"),
    flock = fluid.registerNamespace("flock");

(function () {
    "use strict";

    flock.blit = function (p) {
        var val,
            t;

        if (p >= 2.0) {
            val = 0.0;
        } else if (p >= 1.0) {
            t = 2.0 - p;
            val = 0.16666666666666666 * t * t * t;
        } else if (p >= 0.0) {
            t = p * p;
            val = (0.6666666666666666 - t) + (0.5 * t * p);
        } else if (p >= -1.0) {
            t = p * p;
            val = (0.6666666666666666 - t) - (0.5 * t * p);
        } else if (p >= -2.0) {
            t = 2 + p;
            val = 0.16666666666666666 * t * t * t;
        } else {
            val = 0.0;
        }

        return val;
    };

    flock.blit.period = function (sampleRate, freq) {
        var d0 = sampleRate / freq;
        return d0 < 1.0 ? 1.0 : d0;
    };

    flock.blit.updatePeriodState = function (m, freq) {
        m.freq = freq < 0.000001 ? 0.000001 : freq;
        m.d0 = flock.blit.period(m.sampleRate, m.freq);
    };

    /**
     * A band-limited impulse train.
     *
     * This unit generator is based on the BLIT-FDF method documented in:
     * "Efficient Antialiasing Oscillator Algorithms Using Low-Order Fractional Delay Filters"
     * Juhan Nam, Vesa Valimaki, Jonathan S. Able, and Julius O. Smith
     * in IEEE Transactions on Audio, Speech, and Language Processing, Vol. 18, No. 4, May 2010.
     *
     * Inputs:
     *  - freq: the frequency of the impulse train;
     *          this can only be modulated every period,
     *          so there may be a delay before the frequency is updated at low frequencies
     *  - mul: the amplitude of the impulses
     *  - add: the amplitude offset of the impulses
     */
    flock.ugen.blit = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                out = that.output,
                freq = that.inputs.freq.output[0],
                p = m.phase,
                i,
                val;

            for (i = 0; i < numSamps; i++) {
                p -= 1.0;
                if (p < -2.0) {
                    // We've hit the end of the period.
                    flock.blit.updatePeriodState(m, freq);
                    p += m.d0;
                }

                val = flock.blit(p);
                out[i] = val;
            }

            m.phase = p;
            m.unscaledValue = val;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.init = function () {
            that.onInputChanged();
        };

        that.init();
        return that;
    };

    fluid.defaults("flock.ugen.blit", {
        rate: "audio",

        inputs: {
            freq: 440.0,
            mul: null,
            add: null
        },

        ugenOptions: {
            model: {
                phase: -2.0,
                unscaledValue: 0.0,
                value: 0.0
            }
        }
    });

    /**
     * Generates a band-limited sawtooth wavefrom.
     *
     * This unit generator is based on the BLIT-FDF method documented in:
     * "Efficient Antialiasing Oscillator Algorithms Using Low-Order Fractional Delay Filters"
     * Juhan Nam, Vesa Valimaki, Jonathan S. Able, and Julius O. Smith
     * in IEEE Transactions on Audio, Speech, and Language Processing, Vol. 18, No. 4, May 2010.
     *
     * This unit generator is based on an algorithm that integrates bandlimited impulse trains,
     * and as a result can only change frequencies at the end of each waveform period.
     *
     * Inputs:
     *  - freq: the frequency of the saw;
     *          this can only be modulated every period,
     *          so there may be a delay before the frequency is updated at low frequencies
     *  - leakRate: the leak rate of the leaky integrator (between >0.0 and 1.0)
     *  - mul: the amplitude of the impulses
     *  - add: the amplitude offset of the impulses
     */
    flock.ugen.saw = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                out = that.output,
                freq = that.inputs.freq.output[0],
                leak = 1.0 - that.inputs.leakRate.output[0],
                p = m.phase,
                unscaledValue = m.unscaledValue,
                i;

            // TODO: This can be moved to init() when
            // we have ugen graph priming implemented.
            if (p === undefined) {
                flock.ugen.saw.updatePeriodState(m, freq);
                p = m.d0 / 2;
            }

            for (i = 0; i < numSamps; i++) {
                p -= 1.0;
                if (p < -2.0) {
                    // We've hit the end of the period.
                    flock.ugen.saw.updatePeriodState(m, freq);
                    p += m.d0;
                }

                // Saw is BLIT - dcOffset + (1 - leakRate) * prevVal
                out[i] = unscaledValue = flock.blit(p) - m.dcOffset + leak * unscaledValue;
            }

            m.phase = p;
            m.unscaledValue = unscaledValue;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.init = function () {
            that.onInputChanged();
        };

        that.init();
        return that;
    };

    flock.ugen.saw.updatePeriodState = function (m, freq) {
        flock.blit.updatePeriodState(m, freq);
        m.dcOffset = 1.0 / m.d0; // DC offset at steady state is 1 / d0.
    };

    fluid.defaults("flock.ugen.saw", {
        rate: "audio",

        inputs: {
            freq: 440.0,
            leakRate: 0.01,
            mul: null,
            add: null
        },

        ugenOptions: {
            model: {
                phase: undefined,
                dcOffset: undefined,
                unscaledValue: 0.0,
                value: 0.0
            }
        }
    });

    /**
     * Generates a band-limited square wave.
     *
     * This unit generator is based on the BLIT-FDF method documented in:
     * "Efficient Antialiasing Oscillator Algorithms Using Low-Order Fractional Delay Filters"
     * Juhan Nam, Vesa Valimaki, Jonathan S. Able, and Julius O. Smith
     * in IEEE Transactions on Audio, Speech, and Language Processing, Vol. 18, No. 4, May 2010.
     *
     * This unit generator is based on an algorithm that integrates bandlimited impulse trains,
     * and as a result can only change frequencies at the end of each waveform period.
     *
     * Inputs:
     *  - freq: the frequency of the square;
     *          this can only be modulated every period,
     *          so there may be a delay before the frequency is updated at low frequencies
     *  - leakRate: the leak rate of the leaky integrator (between >0.0 and 1.0)
     *  - mul: the amplitude of the impulses
     *  - add: the amplitude offset of the impulses
     */
    flock.ugen.square = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                out = that.output,
                freq = that.inputs.freq.output[0],
                leak = 1.0 - that.inputs.leakRate.output[0],
                p = m.phase,
                unscaledValue = m.unscaledValue,
                i;

            // TODO: This can be moved to init() when
            // we have ugen graph priming implemented.
            if (p === undefined) {
                flock.ugen.square.updatePeriodState(m, freq);
                p = m.phaseResetValue;
            }

            for (i = 0; i < numSamps; i++) {
                out[i] = unscaledValue = (flock.blit(p) * m.sign) + leak * unscaledValue;

                if (p < -2.0) {
                    flock.ugen.square.updatePeriodState(m, freq);
                    // We've hit the end of the period.
                    p += m.phaseResetValue;
                }

                p -= 1.0;
            }

            m.phase = p;
            m.unscaledValue = unscaledValue;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.init = function () {
            that.onInputChanged();
        };

        that.init();
        return that;
    };

    flock.ugen.square.updatePeriodState = function (m, freq) {
        flock.blit.updatePeriodState(m, freq);
        m.phaseResetValue = m.d0 / 2;
        // Flip the sign of the output.
        m.sign *= -1.0;
    };

    fluid.defaults("flock.ugen.square", {
        rate: "audio",

        inputs: {
            freq: 440.0,
            leakRate: 0.01,
            mul: null,
            add: null
        },

        ugenOptions: {
            model: {
                phase: undefined,
                unscaledValue: 0.5,
                value: 0.5,
                sign: 1.0
            }
        }
    });


    /**
     * Generates a band-limited triangle wave.
     *
     * This unit generator is based on the BLIT-FDF method documented in:
     * "Efficient Antialiasing Oscillator Algorithms Using Low-Order Fractional Delay Filters"
     * Juhan Nam, Vesa Valimaki, Jonathan S. Able, and Julius O. Smith
     * in IEEE Transactions on Audio, Speech, and Language Processing, Vol. 18, No. 4, May 2010.
     *
     * This unit generator is based on an algorithm that integrates bandlimited impulse trains,
     * and as a result can only change frequencies at the end of each waveform period.
     *
     * It will noticeably distort at frequencies above 6000 Hz unless you adjust the
     * leakRate accordingly.
     *
     * Inputs:
     *  - freq: the frequency of the square;
     *          this can only be modulated every period,
     *          so there may be a delay before the frequency is updated at low frequencies
     *  - leakRate: the leak rate of the leaky integrator (between >0.0 and 1.0)
     *  - mul: the amplitude of the impulses
     *  - add: the amplitude offset of the impulses
     */
    flock.ugen.tri = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                out = that.output,
                freq = that.inputs.freq.output[0],
                leak = 1.0 - that.inputs.leakRate.output[0],
                p = m.phase,
                unscaledValue = m.unscaledValue,
                secondPrevVal = m.secondPrevVal,
                i,
                firstIntegrate,
                secondIntegrate;

            // TODO: This can be moved to init() when
            // we have ugen graph priming implemented.
            if (p === undefined) {
                flock.ugen.tri.updatePeriodState(m, freq);
                p = m.d0 / 4;
            }

            for (i = 0; i < numSamps; i++) {
                firstIntegrate = (flock.blit(p) * m.sign) + leak * unscaledValue;
                unscaledValue = firstIntegrate;
                secondIntegrate = firstIntegrate + leak * secondPrevVal;
                secondPrevVal = secondIntegrate;
                out[i] = secondIntegrate * m.ampScale;

                p -= 1.0;
                if (p < -2.0) {
                    flock.ugen.tri.updatePeriodState(m, freq);
                    p += m.phaseResetValue;
                }
            }

            m.phase = p;
            m.unscaledValue = unscaledValue;
            m.secondPrevVal = secondPrevVal;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.init = function () {
            that.onInputChanged();
        };

        that.init();
        return that;
    };

    flock.ugen.tri.updatePeriodState = function (m, freq) {
        flock.blit.updatePeriodState(m, freq);
        m.phaseResetValue = m.d0 / 2;
        m.ampScale = 2 / m.d0;
        // Flip the sign of the output.
        m.sign *= -1.0;
    };

    fluid.defaults("flock.ugen.tri", {
        rate: "audio",

        inputs: {
            freq: 440.0,
            leakRate: 0.01,
            mul: null,
            add: null
        },

        ugenOptions: {
            model: {
                phase: undefined,
                value: 0.5,
                unscaledValue: 0.5,
                secondPrevVal: 0.0,
                sign: 1.0,
                ampScale: undefined,
                phaseResetValue: undefined
            }
        }
    });
}());
;/*
* Flocking Browser-Dependent Unit Generators
* http://github.com/colinbdclark/flocking
*
* Copyright 2013-2014, Colin Clark
* Dual licensed under the MIT and GPL Version 2 licenses.
*/

/*global require, Float32Array, window*/
/*jshint white: false, newcap: true, regexp: true, browser: true,
    forin: false, nomen: true, bitwise: false, maxerr: 100,
    indent: 4, plusplus: false, curly: true, eqeqeq: true,
    freeze: true, latedef: true, noarg: true, nonew: true, quotmark: double, undef: true,
    unused: true, strict: true, asi: false, boss: false, evil: false, expr: false,
    funcscope: false*/

var fluid = fluid || require("infusion"),
    flock = fluid.registerNamespace("flock");

(function () {
    "use strict";

    var $ = fluid.registerNamespace("jQuery");

    fluid.registerNamespace("flock.ugen");

    /***************************
     * Browser-dependent UGens *
     ***************************/

    flock.ugen.scope = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                source = that.inputs.source.output,
                spf = m.spf,
                bufIdx = m.bufIdx,
                buf = m.scope.values,
                i;

            for (i = 0; i < numSamps; i++) {
                buf[bufIdx] = source[i];
                if (bufIdx < spf) {
                    bufIdx += 1;
                } else {
                    bufIdx = 0;
                    that.scopeView.refreshView();
                }
            }

            m.bufIdx = bufIdx;
            m.value = m.unscaledValue = flock.ugen.lastOutputValue(numSamps, source);
        };

        that.onInputChanged = function () {
            // Pass the "source" input directly back as the output from this ugen.
            that.output = that.inputs.source.output;
        };

        that.init = function () {
            that.model.spf = Math.round(that.model.sampleRate / that.options.fps);
            that.model.bufIdx = 0;

            // Set up the scopeView widget.
            that.model.scope = that.options.styles;
            that.model.scope.values = new Float32Array(that.model.spf);
            that.scopeView = flock.view.scope(that.options.canvas, that.model.scope);

            that.onInputChanged();
            that.scopeView.refreshView();
        };

        that.init();
        return that;
    };

    fluid.defaults("flock.ugen.scope", {
        rate: "audio",
        inputs: {
            source: null
        },
        ugenOptions: {
            fps: 60,
            styles: {
                strokeColor: "#777777",
                strokeWidth: 1
            }
        }
    });


    flock.ugen.mouse = {};

    /**
     * Tracks the mouse's position along the specified axis within the boundaries the whole screen.
     * This unit generator will generate a signal between 0.0 and 1.0 based on the position of the mouse;
     * use the mul and add inputs to scale this value to an appropriate control signal.
     */
    flock.ugen.mouse.cursor = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        /**
         * Generates a control rate signal between 0.0 and 1.0 by tracking the mouse's position along the specified axis.
         *
         * @param numSamps the number of samples to generate
         */
        that.exponentialGen = function (numSamps) {
            var m = that.model,
                val = flock.ugen.mouse.cursor.normalize(that.target, m),
                movingAvg = m.movingAvg,
                lag = that.inputs.lag.output[0],
                add = that.inputs.add.output[0],
                mul = that.inputs.mul.output[0],
                lagCoef = m.lagCoef,
                out = that.output,
                i,
                max;

            if (lag !== lagCoef) {
                lagCoef = lag === 0 ? 0.0 : Math.exp(flock.LOG001 / (lag * m.sampleRate));
                m.lagCoef = lagCoef;
            }

            for (i = 0; i < numSamps; i++) {
                max = mul + add;
                val = Math.pow(max  / add, val) * add;
                movingAvg = val + lagCoef * (movingAvg - val); // 1-pole filter averages mouse values.
                out[i] = movingAvg;
            }

            m.movingAvg = movingAvg;
            m.value = m.unscaledValue = movingAvg;
        };

        that.linearGen = function (numSamps) {
            var m = that.model,
                val = flock.ugen.mouse.cursor.normalize(that.target, m),
                movingAvg = m.movingAvg,
                lag = that.inputs.lag.output[0],
                add = that.inputs.add.output[0],
                mul = that.inputs.mul.output[0],
                lagCoef = m.lagCoef,
                out = that.output,
                i;

            if (lag !== lagCoef) {
                lagCoef = lag === 0 ? 0.0 : Math.exp(flock.LOG001 / (lag * m.sampleRate));
                m.lagCoef = lagCoef;
            }

            for (i = 0; i < numSamps; i++) {
                movingAvg = val + lagCoef * (movingAvg - val);
                out[i] = movingAvg * mul + add;
            }

            m.movingAvg = m.unscaledValue = movingAvg;
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.noInterpolationGen = function (numSamps) {
            var m = that.model,
                out = that.output,
                val = flock.ugen.mouse.cursor.normalize(that.target, m),
                i;

            for (i = 0; i < numSamps; i++) {
                out[i] = val * that.inputs.mul.output[0] + that.inputs.add.output[0];
            }

            m.value = m.unscaledValue = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.moveListener = function (e) {
            var m = that.model;
            m.mousePosition = e[m.eventProp];
        };

        that.overListener = function () {
            that.model.isWithinTarget = true;
        };

        that.outListener = function () {
            var m = that.model;
            m.isWithinTarget = false;
            m.mousePosition = 0.0;
        };

        that.downListener = function () {
            that.model.isMouseDown = true;
        };

        that.upListener = function () {
            var m = that.model;
            m.isMouseDown = false;
            m.mousePosition = 0;
        };

        that.moveWhileDownListener = function (e) {
            if (that.model.isMouseDown) {
                that.moveListener(e);
            }
        };

        that.bindEvents = function () {
            var target = that.target,
                moveListener = that.moveListener;

            if (that.options.onlyOnMouseDown) {
                target.mousedown(that.downListener);
                target.mouseup(that.upListener);
                moveListener = that.moveWhileDownListener;
            }

            target.mouseover(that.overListener);
            target.mouseout(that.outListener);
            target.mousemove(moveListener);
        };

        that.onInputChanged = function () {
            flock.onMulAddInputChanged(that);

            var interp = that.options.interpolation;
            that.gen = interp === "none" ? that.noInterpolationGen :
                interp === "exponential" ? that.exponentialGen : that.linearGen;
        };

        that.init = function () {
            var m = that.model,
                options = that.options,
                axis = options.axis,
                target = $(options.target || window);

            if (axis === "x" || axis === "width" || axis === "horizontal") {
                m.eventProp = "clientX";
                m.offsetProp = "left";
                m.dimension = "width";
            } else {
                m.eventProp = "clientY";
                m.offsetProp = "top";
                m.dimension = "height";
            }

            that.target = target;
            m.mousePosition = 0;
            m.movingAvg = 0;

            that.bindEvents();
            that.onInputChanged();
        };

        that.init();
        return that;
    };

    flock.ugen.mouse.cursor.normalize = function (target, m) {
        if (!m.isWithinTarget) {
            return 0.0;
        }

        var size = target[m.dimension](),
            offset = target.offset(),
            pos = m.mousePosition;

        if (offset) {
            pos -= offset[m.offsetProp];
        }

        return pos / size;
    };

    fluid.defaults("flock.ugen.mouse.cursor", {
        rate: "control",
        inputs: {
            lag: 0.5,
            add: 0.0,
            mul: 1.0
        },

        ugenOptions: {
            axis: "x",
            interpolation: "linear",
            model: {
                mousePosition: 0,
                movingAvg: 0,
                value: 0.0
            }
        }
    });


    flock.ugen.mouse.click = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var out = that.output,
                m = that.model,
                i;

            for (i = 0; i < numSamps; i++) {
                out[i] = m.unscaledValue;
            }

            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.mouseDownListener = function () {
            that.model.unscaledValue = 1.0;
        };

        that.mouseUpListener = function () {
            that.model.unscaledValue = 0.0;
        };

        that.init = function () {
            var m = that.model;
            m.target = !that.options.target ? $(window) : $(that.options.target);

            m.target.mousedown(that.mouseDownListener);
            m.target.mouseup(that.mouseUpListener);

            that.onInputChanged();
        };

        that.onInputChanged = function () {
            flock.onMulAddInputChanged(that);
        };

        that.init();
        return that;
    };

    fluid.defaults("flock.ugen.mouse.click", {
        rate: "control"
    });


    flock.ugen.mediaIn = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                out = that.output,
                bus = that.bus,
                val;

            for (var i = 0; i < numSamps; i++) {
                out[i] = val = bus[i];
            }

            m.unscaledValue = val;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged = function () {
            flock.onMulAddInputChanged(that);
        };

        that.init = function () {
            var enviro = flock.environment,
                mediaEl = $(that.options.element),
                // TODO: Direct reference to the shared environment.
                busNum = enviro.audioStrategy.nativeNodeManager.createMediaElementInput(mediaEl[0]);

            that.bus = that.options.buses[busNum];
            that.onInputChanged();

            // TODO: Remove this warning when Safari and Android
            // fix their MediaElementAudioSourceNode implementations.
            if (flock.platform.browser.safari) {
                flock.log.warn("MediaElementSourceNode does not work on Safari. " +
                    "For more information, see https://bugs.webkit.org/show_bug.cgi?id=84743 " +
                    "and https://bugs.webkit.org/show_bug.cgi?id=125031");
            } else if (flock.platform.isAndroid) {
                flock.log.warn("MediaElementSourceNode does not work on Android. " +
                    "For more information, see https://code.google.com/p/chromium/issues/detail?id=419446");
            }
        };

        that.init();
        return that;
    };

    fluid.defaults("flock.ugen.mediaIn", {
        rate: "audio",
        inputs: {
            mul: null,
            add: null
        },
        ugenOptions: {
            element: "audio"
        }
    });
}());
;/*
 * Flocking Buffer Unit Generators
 * http://github.com/colinbdclark/flocking
 *
 * Copyright 2011-2015, Colin Clark
 * Dual licensed under the MIT and GPL Version 2 licenses.
 */

/*global require, Float32Array*/
/*jshint white: false, newcap: true, regexp: true, browser: true,
    forin: false, nomen: true, bitwise: false, maxerr: 100,
    indent: 4, plusplus: false, curly: true, eqeqeq: true,
    freeze: true, latedef: true, noarg: true, nonew: true, quotmark: double, undef: true,
    unused: true, strict: true, asi: false, boss: false, evil: false, expr: false,
    funcscope: false*/

var fluid = fluid || require("infusion"),
    flock = fluid.registerNamespace("flock");

(function () {
    "use strict";

    flock.ugen.playBuffer = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.defaultKrTriggerGen = function (numSamps) {
            var m = that.model,
                out = that.output,
                chan = that.inputs.channel.output[0],
                source = that.buffer.data.channels[chan],
                bufIdx = m.idx,
                loop = that.inputs.loop.output[0],
                trigVal = inputs.trigger.output[0],
                i,
                samp;

            if (trigVal > 0.0 && m.prevTrig <= 0.0) {
                bufIdx = 0;
            }
            m.prevTrig = trigVal;

            for (i = 0; i < numSamps; i++) {
                if (bufIdx > m.lastIdx) {
                    if (loop > 0.0 && trigVal > 0.0) {
                        bufIdx = 0;
                    } else {
                        out[i] = samp = 0.0;
                        continue;
                    }
                }

                samp = that.interpolate(bufIdx, source);
                out[i] = samp;
                bufIdx++;
            }

            m.idx = bufIdx;
            m.unscaledValue = samp;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.otherwiseGen = function (numSamps) {
            var m = that.model,
                out = that.output,
                chan = that.inputs.channel.output[0],
                speed = that.inputs.speed.output,
                source = that.buffer.data.channels[chan],
                trig = inputs.trigger.output,
                bufIdx = m.idx,
                loop = that.inputs.loop.output[0],
                start = (that.inputs.start.output[0] * m.lastIdx) | 0,
                end = (that.inputs.end.output[0] * m.lastIdx) | 0,
                i,
                j,
                k,
                trigVal,
                speedVal,
                samp;

            for (i = 0, j = 0, k = 0; i < numSamps; i++, j += m.strides.trigger, k += m.strides.speed) {
                trigVal = trig[j];
                speedVal = speed[k];

                if (trigVal > 0.0 && m.prevTrig <= 0.0) {
                    bufIdx = flock.ugen.playBuffer.resetIndex(speedVal, start, end);
                } else if (bufIdx < start || bufIdx > end) {
                    if (loop > 0.0 && trigVal > 0.0) {
                        bufIdx = flock.ugen.playBuffer.resetIndex(speedVal, start, end);
                    } else {
                        out[i] = samp = 0.0;
                        continue;
                    }
                }
                m.prevTrig = trig[j];

                samp = that.interpolate(bufIdx, source);
                out[i] = samp;
                bufIdx += m.stepSize * speedVal;
            }

            m.idx = bufIdx;
            m.unscaledValue = samp;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged = function (inputName) {
            var inputs = that.inputs,
                speed = inputs.speed,
                start = inputs.start,
                end = inputs.end,
                trig = inputs.trigger;

            that.onBufferInputChanged(inputName);

            // TODO: Optimize for non-regular speed constant rate input.
            that.gen = (speed.rate === flock.rates.CONSTANT && speed.output[0] === 1.0) &&
                (start.rate === flock.rates.CONSTANT && start.output[0] === 0.0) &&
                (end.rate === flock.rates.CONSTANT && end.output[0] === 1.0) &&
                (trig.rate !== flock.rates.AUDIO) ?
                that.defaultKrTriggerGen : that.otherwiseGen;

            that.calculateStrides();
            flock.onMulAddInputChanged(that);
        };

        that.onBufferReady = function () {
            var m = that.model,
                end = that.inputs.end.output[0],
                chan = that.inputs.channel.output[0],
                buf = that.buffer.data.channels[chan],
                len = buf.length;

            m.idx = (end * len) | 0;
            m.lastIdx = len - 1;
            m.stepSize = that.buffer.format.sampleRate / m.sampleRate;
        };

        that.init = function () {
            flock.ugen.buffer(that);
            that.initBuffer();
            that.onInputChanged();
        };

        that.init();
        return that;
    };

    flock.ugen.playBuffer.resetIndex = function (speed, start, end) {
        return speed > 0 ? start : end;
    };

    fluid.defaults("flock.ugen.playBuffer", {
        rate: "audio",
        inputs: {
            channel: 0,
            loop: 0.0,
            speed: 1.0,
            start: 0.0,
            end: 1.0,
            trigger: 1.0,
            buffer: null,
            mul: null,
            add: null
        },
        ugenOptions: {
            model: {
                finished: false,
                unscaledValue: 0.0,
                value: 0.0,
                idx: 0,
                stepSize: 0,
                prevTrig: 0,
                channel: undefined
            },
            strideInputs: ["trigger", "speed"],
            interpolation: "linear"
        }
    });

    /**
     * Reads values out of a buffer at the specified phase index.
     * This unit generator is typically used with flock.ugen.phasor or similar unit generator to
     * scan through the buffer at a particular rate.
     *
     * Inputs:
     *  - buffer: a bufDef representing the buffer to read from
     *  - channel: the channel of the buffer to read from
     *  - phase: the phase of the buffer to read (this should be a value between 0..1)
     */
    // TODO: This should be refactored based on the model of bufferPhaseStep below.
    flock.ugen.readBuffer = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                phaseS = m.strides.phase,
                out = that.output,
                chan = that.inputs.channel.output[0],
                phase = that.inputs.phase.output,
                source = that.buffer.data.channels[chan],
                sourceLen = source.length,
                i,
                bufIdx,
                j,
                val;

            for (i = j = 0; i < numSamps; i++, j += phaseS) {
                bufIdx = phase[j] * sourceLen;
                val = that.interpolate(bufIdx, source);
                out[i] = val;
            }

            m.unscaledValue = val;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged = function (inputName) {
            that.onBufferInputChanged(inputName);
            that.calculateStrides();
            flock.onMulAddInputChanged(that);
        };

        that.init = function () {
            flock.ugen.buffer(that);
            that.initBuffer();
            that.onInputChanged();
        };

        that.init();
        return that;
    };

    fluid.defaults("flock.ugen.readBuffer", {
        rate: "audio",

        inputs: {
            buffer: null,
            channel: 0,
            phase: 0,
            mul: null,
            add: null
        },

        ugenOptions: {
            model: {
                channel: undefined,
                unscaledValue: 0.0,
                value: 0.0
            },
            strideInputs: [
                "phase"
            ],
            interpolation: "linear"
        }
    });

    /**
     * Writes input into a buffer.
     *
     * Inputs:
     *
     *   sources: the inputs to write to the buffer,
     *   buffer: a bufferDef to write to; the buffer will be created if it doesn't already exist
     *   start: the index into the buffer to start writing at; defaults to 0
     *   loop: a flag specifying if the unit generator should loop back to the beginning
     *         of the buffer when it reaches the end; defaults to 0.
     */
    flock.ugen.writeBuffer = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                out = that.output,
                inputs = that.inputs,
                buffer = that.buffer,
                sources = that.multiInputs.sources,
                numChans = sources.length,
                bufferChannels = buffer.data.channels,
                numFrames = buffer.format.numSampleFrames,
                startIdx = inputs.start.output[0],
                loop = inputs.loop.output[0],
                i,
                channelWriteIdx,
                j;

            if (m.prevStart !== startIdx) {
                m.prevStart = startIdx;
                m.writeIdx = Math.floor(startIdx);
            }

            for (i = 0; i < numChans; i++) {
                var inputChannel = sources[i].output;
                var bufferChannel = bufferChannels[i];
                var outputChannel = out[i];
                channelWriteIdx = m.writeIdx;

                for (j = 0; j < numSamps; j++) {
                    var samp = inputChannel[j];

                    // TODO: Remove this conditional by being smarter about dynamic outputs.
                    if (outputChannel) {
                        outputChannel[j] = samp;
                    }

                    if (channelWriteIdx < numFrames) {
                        bufferChannel[channelWriteIdx] = samp;
                    } else if (loop > 0) {
                        channelWriteIdx = Math.floor(startIdx);
                        bufferChannel[channelWriteIdx] = samp;
                    }
                    channelWriteIdx++;
                }
            }

            m.writeIdx = channelWriteIdx;
            that.mulAdd(numSamps);
        };

        that.createBuffer = function (that, bufDef) {
            var o = that.options,
                s = o.audioSettings,
                buffers = o.buffers,
                numChans = that.multiInputs.sources.length,
                duration = Math.round(that.options.duration * s.rates.audio),
                channels = new Array(numChans),
                i;

            // We need to make a new buffer.
            for (i = 0; i < numChans; i++) {
                channels[i] = new Float32Array(duration);
            }

            var buffer = flock.bufferDesc(channels, s.rates.audio, numChans);

            if (bufDef.id) {
                buffer.id = bufDef.id;
                buffers[bufDef.id] = buffer;
            }

            return buffer;
        };

        that.setupBuffer = function (bufDef) {
            bufDef = typeof bufDef === "string" ? {id: bufDef} : bufDef;

            var existingBuffer;
            if (bufDef.id) {
                // Check for an existing environment buffer.
                existingBuffer = that.options.buffers[bufDef.id];
            }

            that.buffer = existingBuffer || that.createBuffer(that, bufDef);

            return that.buffer;
        };

        that.onInputChanged = function (inputName) {
            if (!inputName) {
                that.collectMultiInputs();
                that.setupBuffer(that.inputs.buffer);
            } else if (inputName === "sources") {
                that.collectMultiInputs();
            } else if (inputName === "buffer") {
                that.setupBuffer(that.inputs.buffer);
            }

            flock.onMulAddInputChanged(that);
        };

        that.init = function () {
            that.onInputChanged();
        };

        that.init();

        return that;
    };

    fluid.defaults("flock.ugen.writeBuffer", {
        rate: "audio",

        inputs: {
            sources: null,
            buffer: null,
            start: 0,
            loop: 0
        },

        ugenOptions: {
            model: {
                prevStart: undefined,
                writeIdx: 0
            },

            tags: ["flock.ugen.multiChannelOutput"],
            numOutputs: 2, // TODO: Should be dynamically set to sources.length; user has to override.
            multiInputNames: ["sources"],
            duration: 600 // In seconds. Default is 10 minutes.
        }
    });


    /**
     * Outputs the duration of the specified buffer. Runs at either constant or control rate.
     * Use control rate only when the underlying buffer may change dynamically.
     *
     * Inputs:
     *  buffer: a bufDef object specifying the buffer to track
     */
    flock.ugen.bufferDuration = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.krGen = function (numSamps) {
            var m = that.model,
                out = that.output,
                chan = that.inputs.channel.output[0],
                source = that.buffer.data.channels[chan],
                rate = that.buffer.format.sampleRate,
                i;

            for (i = 0; i < numSamps; i++) {
                out[i] = source.length / rate;
            }

            m.unscaledValue = m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged = function (inputName) {
            that.onBufferInputChanged(inputName);
        };

        that.onBufferReady = function () {
            that.krGen(1);
        };

        that.init = function () {
            var r = that.rate;
            that.gen = (r === flock.rates.CONTROL || r === flock.rates.AUDIO) ? that.krGen : undefined;
            that.output[0] = 0.0;
            flock.ugen.buffer(that);
            that.initBuffer();
            that.onInputChanged();
        };

        that.init();
        return that;
    };

    fluid.defaults("flock.ugen.bufferDuration", {
        rate: "constant",
        inputs: {
            buffer: null,
            channel: 0
        },
        ugenOptions: {
            model: {
                unscaledValue: 0.0,
                value: 0.0
            }
        }
    });

    /**
     * Outputs the length of the specified buffer in samples. Runs at either constant or control rate.
     * Use control rate only when the underlying buffer may change dynamically.
     *
     * Inputs:
     *  buffer: a bufDef object specifying the buffer to track
     */
    flock.ugen.bufferLength = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.krGen = function (numSamps) {
            var m = that.model,
                out = that.output,
                chan = that.inputs.channel.output[0],
                source = that.buffer.data.channels[chan],
                len = source.length,
                i;

            for (i = 0; i < numSamps; i++) {
                out[i] = len;
            }

            m.value = m.unscaledValue = len;
        };

        that.onInputChanged = function (inputName) {
            that.onBufferInputChanged(inputName);
        };

        that.onBufferReady = function () {
            that.krGen(1);
        };

        that.init = function () {
            var r = that.rate;
            that.gen = (r === flock.rates.CONTROL || r === flock.rates.AUDIO) ? that.krGen : undefined;
            that.output[0] = 0.0;
            flock.ugen.buffer(that);
            that.initBuffer();
            that.onInputChanged();
        };

        that.init();
        return that;
    };

    fluid.defaults("flock.ugen.bufferLength", {
        rate: "constant",
        inputs: {
            buffer: null,
            channel: 0
        },
        ugenOptions: {
            model: {
                unscaledValue: 0.0,
                value: 0.0
            }
        }
    });

    /**
     * Outputs a phase step value for playing the specified buffer at its normal playback rate.
     * This unit generator takes into account any differences between the sound file's sample rate and
     * the AudioSystem's audio rate.
     *
     * Inputs:
     *  buffer: a bufDef object specifying the buffer to track
     */
    flock.ugen.bufferPhaseStep = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.krGen = function (numSamps) {
            var m = that.model,
                out = that.output,
                val = m.unscaledValue,
                i;

            for (i = 0; i < numSamps; i++) {
                out[i] = val;
            }

            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged = function (inputName) {
            that.onBufferInputChanged(inputName);
            flock.onMulAddInputChanged(that);
        };

        that.onBufferReady = function (buffer) {
            var m = that.model,
                chan = that.inputs.channel.output[0],
                source = buffer.data.channels[chan],
                enviroRate = that.options.audioSettings.rates.audio,
                bufferRate = that.buffer.format.sampleRate || enviroRate;

            m.scale = bufferRate / enviroRate;
            that.output[0] = m.unscaledValue = 1 / (source.length * m.scale);
        };

        that.init = function () {
            var r = that.rate;
            that.gen = (r === flock.rates.CONTROL || r === flock.rates.AUDIO) ? that.krGen : undefined;
            that.output[0] = 0.0;
            flock.ugen.buffer(that);
            that.initBuffer();
            that.onInputChanged();
        };

        that.init();
        return that;
    };

    fluid.defaults("flock.ugen.bufferPhaseStep", {
        rate: "constant",
        inputs: {
            buffer: null,
            channel: 0
        },
        ugenOptions: {
            model: {
                scale: 1.0,
                unscaledValue: 0.0,
                value: 0.0
            }
        }
    });

    /**
     * Constant-rate unit generator that outputs the AudioSystem's current audio sample rate.
     */
    flock.ugen.sampleRate = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options),
            m = that.model;

        that.output[0] = m.value = m.unscaledValue = that.options.audioSettings.rates.audio;

        return that;
    };

    fluid.defaults("flock.ugen.sampleRate", {
        rate: "constant",
        inputs: {}
    });


}());
;/*
 * Flocking Debugging Unit Generators
 * http://github.com/colinbdclark/flocking
 *
 * Copyright 2011-2014, Colin Clark
 * Dual licensed under the MIT and GPL Version 2 licenses.
 */

/*global require*/
/*jshint white: false, newcap: true, regexp: true, browser: true,
    forin: false, nomen: true, bitwise: false, maxerr: 100,
    indent: 4, plusplus: false, curly: true, eqeqeq: true,
    freeze: true, latedef: true, noarg: true, nonew: true, quotmark: double, undef: true,
    unused: true, strict: true, asi: false, boss: false, evil: false, expr: false,
    funcscope: false*/

var fluid = fluid || require("infusion"),
    flock = fluid.registerNamespace("flock");

(function () {
    "use strict";

    // TODO: Unit tests.
    flock.ugen.print = function (input, output, options) {
        var that = flock.ugen(input, output, options);

        that.gen = function (numSamps) {
            var inputs = that.inputs,
                out = that.output,
                m = that.model,
                label = m.label,
                chan = inputs.channel,
                // Basic multichannel support. This should be inproved
                // by factoring the multichannel input code out of flock.ugen.out.
                source = chan ? inputs.source.output[chan.output[0]] : inputs.source.output,
                trig = inputs.trigger.output[0],
                freq = inputs.freq.output[0],
                i,
                j,
                val;

            if (trig > 0.0 && m.prevTrig <= 0.0) {
                fluid.log(fluid.logLevel.IMPORTANT, label + source);
            }

            if (m.freq !== freq) {
                m.sampInterval = Math.round(m.sampleRate / freq);
                m.freq = freq;
                m.counter = m.sampInterval;
            }

            for (i = 0, j = 0 ; i < numSamps; i++, j += m.strides.source) {
                if (m.counter >= m.sampInterval) {
                    fluid.log(fluid.logLevel.IMPORTANT, label + source[j]);
                    m.counter = 0;
                }
                m.counter++;
                out[i] = val = source[i];
            }

            m.value = m.unscaledValue = val;
        };

        that.init = function () {
            var o = that.options;
            that.model.label = o.label ? o.label + ": " : "";
            that.onInputChanged();
        };

        that.init();
        return that;
    };

    fluid.defaults("flock.ugen.print", {
        rate: "audio",
        inputs: {
            source: null,
            trigger: 0.0,
            freq: 1.0
        },
        ugenOptions: {
            model: {
                unscaledValue: 0.0,
                value: 0.0,
                counter: 0
            },
            strideInputs: ["source"]
        }
    });

}());
;/*
 * Flocking Distortion Unit Generators
 * http://github.com/colinbdclark/flocking
 *
 * Copyright 2011-2015, Colin Clark
 * Dual licensed under the MIT and GPL Version 2 licenses.
 */

/*global require*/
/*jshint white: false, newcap: true, regexp: true, browser: true,
    forin: false, nomen: true, bitwise: false, maxerr: 100,
    indent: 4, plusplus: false, curly: true, eqeqeq: true,
    freeze: true, latedef: true, noarg: true, nonew: true, quotmark: double, undef: true,
    unused: true, strict: true, asi: false, boss: false, evil: false, expr: false,
    funcscope: false*/

var fluid = fluid || require("infusion"),
    flock = fluid.registerNamespace("flock");

(function () {
    "use strict";

    /**
     * A simple waveshaper-based distortion effect.
     * Uses the polynomial y = (3/2) * x - (1/2) * x^3.
     * http://www.musicdsp.org/showone.php?id=114
     *
     * Inputs:
     *   - source: the input signal to distort
     *   - gain: the gain factor to apply [1.0..Infinity]
     */
    flock.ugen.distortion = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                out = that.output,
                source = that.inputs.source.output,
                sourceInc = m.strides.source,
                gain = that.inputs.gain.output,
                gainInc = m.strides.gain,
                val,
                dist,
                i,
                j,
                k;

            for (i = j =  k = 0; i < numSamps; i++, j += sourceInc, k += gainInc) {
                val = source[j] * gain[k];
                dist = 1.5 * val - 0.5 * val * val * val;
                out[i] = dist;
            }

            m.unscaledValue = dist;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged();

        return that;
    };

    fluid.defaults("flock.ugen.distortion", {
        rate: "audio",
        inputs: {
            source: null,
            gain: 1.0
        },
        ugenOptions: {
            strideInputs: ["source", "gain"]
        }
    });


    /**
     * A simple waveshaper-based distortion effect by Bram de Jonge.
     * http://www.musicdsp.org/showone.php?id=41
     *
     * Inputs:
     *   - source: the input signal
     *   - amount: a value between 1 and Infinity that represents the amount of distortion
     *             to apply.
     */
    flock.ugen.distortion.deJonge = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                out = that.output,
                source = that.inputs.source.output,
                sourceInc = m.strides.source,
                amount = that.inputs.amount.output,
                amountInc = m.strides.amount,
                x,
                a,
                absX,
                dist,
                i,
                j,
                k;

            for (i = j = k = 0; i < numSamps; i++, j += sourceInc, k += amountInc) {
                x = source[j];
                a = amount[k];
                absX = Math.abs(x);
                dist = x * (absX + a) / ((x * x) + (a - 1) * absX + 1);
                out[i] = dist;
            }

            m.unscaledValue = dist;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged();

        return that;
    };

    fluid.defaults("flock.ugen.distortion.deJonge", {
        rate: "audio",
        inputs: {
            source: null,
            amount: 2
        },
        ugenOptions: {
            strideInputs: ["source", "amount"]
        }
    });


    /**
     * A simple waveshaper-based distortion effect by Partice Tarrabia and Bram de Jong.
     * http://www.musicdsp.org/showone.php?id=46
     *
     * Inputs:
     *   - source: the input signal
     *   - amount: a value between -1 and 1 that represents the amount of distortion
     *             to apply.
     */
    flock.ugen.distortion.tarrabiaDeJonge = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                out = that.output,
                source = that.inputs.source.output,
                sourceInc = m.strides.source,
                amount = that.inputs.amount.output,
                amountInc = m.strides.amount,
                x,
                a,
                dist,
                i,
                sIdx,
                aIdx,
                k;

            for (i = sIdx = aIdx = 0; i < numSamps; i++, sIdx += sourceInc, aIdx += amountInc) {
                x = source[sIdx];
                a = amount[aIdx];

                // Expects an amount value in the range of
                // -1.0 to 1.0, but NaNs are produced with exact 1.0s.
                if (a >= 1.0) {
                    a = 0.9999999999999999;
                } else if (a < -1.0) {
                    a = -1.0;
                }

                k = 2 * a / (1 - a);
                dist = (1 + k) * x / (1 + k * Math.abs(x));
                out[i] = dist;
            }

            m.unscaledValue = dist;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged();

        return that;
    };

    fluid.defaults("flock.ugen.distortion.tarrabiaDeJonge", {
        rate: "audio",
        inputs: {
            source: null,
            amount: 10
        },
        ugenOptions: {
            strideInputs: ["source", "amount"]
        }
    });


    /**
     * Waveshaper distortion by Laurent de Soras.
     * http://www.musicdsp.org/showone.php?id=86
     *
     * Inputs:
     *   - source: the signal to distort
     *   - gain: the gain factor to apply [1.0..Infinity]
     */
    flock.ugen.distortion.gloubiBoulga = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                out = that.output,
                source = that.inputs.source.output,
                sourceInc = m.strides.source,
                gain = that.inputs.gain.output,
                gainInc = m.strides.gain,
                val,
                dist,
                i,
                j,
                k,
                x,
                a,
                expX;

            for (i = j = k = 0; i < numSamps; i++, j += sourceInc, k += gainInc) {
                val = source[j] * gain[k];
                x = val * 0.686306;
                a = 1 + Math.exp(Math.sqrt(Math.abs(x)) * -0.75);
                expX = Math.exp(x);
                dist = (expX - Math.exp(-x * a)) / (expX + Math.exp(-x));
                out[i] = dist;
            }

            m.unscaledValue = dist;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged();

        return that;
    };

    fluid.defaults("flock.ugen.distortion.gloubiBoulga", {
        rate: "audio",
        inputs: {
            source: null,
            gain: 1.0
        },
        ugenOptions: {
            strideInputs: ["source", "gain"]
        }
    });

}());
;/*
 * Flocking Dynamics Unit Generators
 * http://github.com/colinbdclark/flocking
 *
 * Copyright 2011-2015, Colin Clark
 * Dual licensed under the MIT and GPL Version 2 licenses.
 */

/*global require*/
/*jshint white: false, newcap: true, regexp: true, browser: true,
    forin: false, nomen: true, bitwise: false, maxerr: 100,
    indent: 4, plusplus: false, curly: true, eqeqeq: true,
    freeze: true, latedef: true, noarg: true, nonew: true, quotmark: double, undef: true,
    unused: true, strict: true, asi: false, boss: false, evil: false, expr: false,
    funcscope: false*/

var fluid = fluid || require("infusion"),
    flock = fluid.registerNamespace("flock");

(function () {
    "use strict";

    flock.ugen.normalize = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function () {
            var m = that.model,
                out = that.output,
                max = that.inputs.max.output[0], // Max is kr.
                source = that.inputs.source.output;

            // Note, this normalizes the source input ugen's output buffer directly in place.
            flock.normalize(source, max, out);
            m.value = m.unscaledValue = out[out.length - 1];
        };

        that.onInputChanged();
        return that;
    };

    fluid.defaults("flock.ugen.normalize", {
        rate: "audio",
        inputs: {
            max: 1.0,
            source: null
        }
    });

}());
;/*
 * Flocking Envelopes
 * http://github.com/colinbdclark/flocking
 *
 * Copyright 2011-2014, Colin Clark
 * Dual licensed under the MIT and GPL Version 2 licenses.
 */

/*global require*/
/*jshint white: false, newcap: true, regexp: true, browser: true,
    forin: false, nomen: true, bitwise: false, maxerr: 100,
    indent: 4, plusplus: false, curly: true, eqeqeq: true,
    freeze: true, latedef: true, noarg: true, nonew: true, quotmark: double, undef: true,
    unused: true, strict: true, asi: false, boss: false, evil: false, expr: false,
    funcscope: false*/

var fluid = fluid || require("infusion"),
    flock = fluid.registerNamespace("flock");

(function () {
    "use strict";

    var $ = fluid.registerNamespace("jQuery"),
        ArrayMath = flock.requireModule("webarraymath", "ArrayMath");

    /*********************
     * Envelope Creators *
     *********************/

    flock.envelope = {};

    // Unsupported API.
    flock.envelope.makeCreator = function (name, envelopeOptionsTransformer) {
        return function (options) {
            var defaults = fluid.defaults(name),
                merged = $.extend(true, {}, defaults, options);

            return envelopeOptionsTransformer(merged);
        };
    };

    // Unsupported API.
    flock.envelope.registerCreators = function (inNamespace, creatorSpecs) {
        var path, creatorSpec;

        for (var pathSuffix in creatorSpecs) {
            path = fluid.pathUtil.composePath(inNamespace, pathSuffix);
            creatorSpec = creatorSpecs[pathSuffix];

            fluid.defaults(path, creatorSpec.defaults);
            fluid.setGlobalValue(path, flock.envelope.makeCreator(path, creatorSpec.transformer));
        }
    };

    // Unsupported API.
    flock.envelope.creatorSpecs = {
        line: {
            transformer: function (o) {
                return {
                    levels: [o.start, o.end],
                    times: [o.duration]
                };
            },

            defaults: {
                start: 0.0,
                end: 1.0,
                duration: 1.0
            }
        },

        linear: {
            transformer: function (o) {
                return {
                    levels: [0, o.level, o.level, 0],
                    times: [o.attack, o.sustain, o.release]
                };
            },

            defaults: {
                level: 1.0,
                attack: 0.01,
                sustain: 1.0,
                release: 1.0
            }
        },

        tri: {
            transformer: function (o) {
                return {
                    levels: [0, o.level, 0],
                    times: [o.duration, o.duration]
                };
            },

            defaults: {
                level: 1.0,
                duration: 1.0
            }
        },

        sin: {
            transformer: function (o) {
                return {
                    levels: [0, o.level, 0],
                    times: [o.duration, o.duration],
                    curve: "sin"
                };
            },

            defaults: {
                level: 1.0,
                duration: 1.0
            }
        },

        asr: {
            transformer: function (o) {
                return {
                    levels: [0, o.sustain, 0],
                    times: [o.attack, o.release],
                    sustainPoint: 1,
                    curve: -4.0
                };
            },

            defaults: {
                sustain: 1.0,
                attack: 0.01,
                release: 1.0
            }
        },

        dadsr: {
            transformer: function (o) {
                var levels = [0, 0, o.peak, o.peak * o.sustain, 0];
                ArrayMath.add(levels, o.bias, levels);

                return {
                    levels: levels,
                    times: [o.delay, o.attack, o.decay, o.release],
                    sustainPoint: 3,
                    curve: -4.0
                };
            },

            defaults: {
                delay: 0.1,
                attack: 0.01,
                decay: 0.3,
                sustain: 0.5,
                release: 1.0,
                peak: 1.0,
                bias: 0.0
            }
        },

        adsr: {
            transformer: function (o) {
                var levels = [0, o.peak, o.peak * o.sustain, 0];
                ArrayMath.add(levels, o.bias, levels);

                return {
                    levels: levels,
                    times: [o.attack, o.decay, o.release],
                    sustainPoint: 2,
                    curve: -4.0
                };
            },

            defaults: {
                attack: 0.01,
                decay: 0.3,
                sustain: 0.5,
                release: 1.0,
                peak: 1.0,
                bias: 0.0
            }
        }
    };

    flock.envelope.registerCreators("flock.envelope", flock.envelope.creatorSpecs);

    flock.envelope.validate = function (envelope, failOnError) {
        var levels = envelope.levels,
            report = {};

        if (!envelope.times) {
            report.times = "An array containing at least one time value must be specified.";
        } else if (!levels || levels.length < 2) {
            report.levels = "An array containing at least two levels must be specified.";
        } else {
            flock.envelope.validate.times(envelope.times, levels, report);
            flock.envelope.validate.levels(levels, report);
            flock.envelope.validate.curves(envelope.curve, levels, report);
            flock.envelope.validate.sustainPoint(envelope.sustainPoint, levels, report);
        }

        if (failOnError !== false) {
            for (var errorProp in report) {
                flock.fail(report[errorProp]);
            }
        }

        return report;
    };

    flock.envelope.validate.times = function (times, levels, report) {
        if (times.length !== levels.length - 1) {
            report.times = "The envelope specification should provide one fewer time value " +
                "than the number of level values. times: " + times + " levels: " + levels;
        }

        for (var i = 0; i < times.length; i++) {
            var time = times[i];

            if (isNaN(time)) {
                report.times = "A NaN time value was specified at index " +
                    i + ". times: " + times;
            }

            if (time < 0) {
                report.times = "All times should be positive values. times: " + times;
            }
        }
    };

    flock.envelope.validate.levels = function (levels, report) {
        for (var i = 0; i < levels.length; i++) {
            if (isNaN(levels[i])) {
                report.levels = "A NaN level value was specified at index " +
                    i + ". levels: " + levels;
            }
        }
    };

    flock.envelope.validate.curves = function (curve, levels, report) {
        if (!curve) {
            return report;
        }

        if (flock.isIterable(curve)) {
            if (curve.length !== levels.length - 1) {
                report.curve = "When curve is specified as an array, " +
                    "there should be one fewer curve value " +
                    "than the number of level values. curve: " +
                    curve + " levels: " + levels;
            }

            fluid.each(curve, function (curveName) {
                var lineGen = flock.line.generator(curveName);
                if (!lineGen) {
                    report.curve = "'" + curveName + "' is not a valid curve type. curve: " + curve;
                }
            });
        }

        var lineGen = flock.line.generator(curve);
        if (!lineGen) {
            report.curve = "'" + curve + "' is not a valid curve type.";
        }
    };

    flock.envelope.validate.sustainPoint = function (sustainPoint, levels, report) {
        if (sustainPoint < 0 || sustainPoint >= levels.length) {
            report.sustainPoint = "The specified sustainPoint index is out range for the levels array. " +
                "sustainPoint: " + sustainPoint + " levels: " + levels;
        }
    };

    /**
     * Takes an envelope specification and expands it,
     * producing an envelope object.
     */
    flock.envelope.expand = function (envSpec) {
        var envelope = typeof envSpec === "string" ? fluid.invokeGlobalFunction(envSpec) :
            envSpec.type ? fluid.invokeGlobalFunction(envSpec.type, [envSpec]) : envSpec;

        // Catch a common naming mistake and alias it to the correct name.
        if (envelope.curves && !envelope.curve) {
            envelope.curve = envelope.curves;
        }

        if (!flock.isIterable(envelope.curve)) {
            var numCurves = envelope.levels.length - 1;
            envelope.curve = flock.generate(new Array(numCurves), envelope.curve);
        }

        flock.envelope.validate(envelope, true);

        return envelope;
    };


    /****************************
     * Line Generator Functions *
     ****************************/

    flock.line = {
        // TODO: Unit tests!
        // e.g. flock.line.fill("linear", new Float32Array(64), 0, 1);
        fill: function (type, buffer, start, end, startIdx, endIdx) {
            startIdx = startIdx === undefined ? 0 : startIdx;
            endIdx = endIdx === undefined ? buffer.length : endIdx;

            var numSamps = endIdx - startIdx,
                m = flock.line.fill.model;

            m.unscaledValue = start;
            m.destination = end;
            m.numSegmentSamps = numSamps - 1;

            if (typeof type === "number") {
                m.currentCurve = type;
                type = "curve";
            }

            var generator = flock.line[type];
            if (!generator) {
                flock.fail("No line generator could be found for type " + type);
            }
            generator.init(m);

            return generator.gen(numSamps, startIdx, buffer, m);
        },

        generator: function (curve) {
            var type = typeof curve;

            return type === "string" ? flock.line[curve] :
                type === "number" ? flock.line.curve : flock.line.linear;
        },

        constant: {
            init: function (m) {
                m.stepSize = 0;
            },

            gen: function (numSamps, idx, buffer, m) {
                var val = m.unscaledValue;
                for (var i = idx; i < numSamps + idx; i++) {
                    buffer[i] = val;
                }

                return buffer;
            }
        },

        step: {
            init: function (m) {
                m.arrived = false;
            },

            gen: function (numSamps, idx, buffer, m) {
                for (var i = idx; i < numSamps + idx; i++) {
                    buffer[i] = m.unscaledValue;
                    if (!m.arrived) {
                        m.arrived = true;
                        m.unscaledValue = m.destination;
                    }
                }

                return buffer;
            }
        },

        linear: {
            init: function (m) {
                m.stepSize = (m.destination - m.unscaledValue) / m.numSegmentSamps;
            },

            gen: function (numSamps, idx, buffer, m) {
                var val = m.unscaledValue,
                    stepSize = m.stepSize;

                for (var i = idx; i < numSamps + idx; i++) {
                    buffer[i] = val;
                    val += stepSize;
                }

                m.unscaledValue = val;
                m.stepSize = stepSize;

                return buffer;
            }
        },

        exponential: {
            init: function (m) {
                if (m.unscaledValue === 0) {
                    m.unscaledValue = 0.0000000000000001;
                }
                m.stepSize = m.numSegmentSamps === 0 ? 0 :
                    Math.pow(m.destination / m.unscaledValue, 1.0 / m.numSegmentSamps);
            },

            gen: function (numSamps, idx, buffer, m) {
                var val = m.unscaledValue,
                    stepSize = m.stepSize;

                for (var i = idx; i < numSamps + idx; i++) {
                    buffer[i] = val;
                    val *= stepSize;
                }

                m.unscaledValue = val;
                m.stepSize = stepSize;

                return buffer;
            }
        },

        curve: {
            init: function (m) {
                if (Math.abs(m.currentCurve) < 0.001) {
                    // A curve value this small might as well be linear.
                    return flock.line.linear.init(m);
                } else {
                    var a1 = (m.destination - m.unscaledValue) / (1.0 - Math.exp(m.currentCurve));
                    m.a2 = m.unscaledValue + a1;
                    m.b1 = a1;
                    m.stepSize = Math.exp(m.currentCurve / m.numSegmentSamps);
                }
            },

            gen: function (numSamps, idx, buffer, m) {
                var val = m.unscaledValue,
                    b1 = m.b1;

                for (var i = idx; i < numSamps + idx; i++) {
                    buffer[i] = val;
                    b1 *= m.stepSize;
                    val = m.a2 - b1;
                }

                m.unscaledValue = val;
                m.b1 = b1;

                return buffer;
            }
        },

        sin: {
            init: function (m) {
                var w = Math.PI / m.numSegmentSamps;
                m.a2 = (m.destination + m.unscaledValue) * 0.5;
                m.b1 = 2.0 * Math.cos(w);
                m.y1 = (m.destination - m.unscaledValue) * 0.5;
                m.y2 = m.y1 * Math.sin(flock.HALFPI - w);
                m.unscaledValue = m.a2 - m.y1;
            },

            gen: function (numSamps, idx, buffer, m) {
                var val = m.unscaledValue,
                    y1 = m.y1,
                    y2 = m.y2,
                    y0;

                for (var i = idx; i < numSamps + idx; i++) {
                    buffer[i] = val;
                    y0 = m.b1 * y1 - y2;
                    val = m.a2 - y0;
                    y2 = y1;
                    y1 = y0;
                }

                m.unscaledValue = val;
                m.y1 = y1;
                m.y2 = y2;

                return buffer;
            }
        },

        welsh: {
            init: function (m) {
                var w = flock.HALFPI / m.numSegmentSamps,
                    cosW = Math.cos(w);

                m.b1 = 2.0 * cosW;

                if (m.destination >= m.unscaledValue) {
                    m.a2 = m.unscaledValue;
                    m.y1 = 0.0;
                    m.y2 = -Math.sin(w) * (m.destination - m.unscaledValue);
                } else {
                    m.a2 = m.destination;
                    m.y1 = m.unscaledValue - m.destination;
                    m.y2 = cosW * (m.unscaledValue - m.destination);
                }

                m.unscaledValue = m.a2 + m.y1;
            },

            gen: function (numSamps, idx, buffer, m) {
                var val = m.unscaledValue,
                    y1 = m.y1,
                    y2 = m.y2,
                    y0;

                for (var i = idx; i < numSamps + idx; i++) {
                    buffer[i] = val;
                    y0 = m.b1 * y1 - y2;
                    y2 = y1;
                    y1 = y0;
                    val = m.a2 + y0;
                }

                m.unscaledValue = val;
                m.y1 = y1;
                m.y2 = y2;

                return buffer;
            }
        },

        squared: {
            init: function (m) {
                m.y1 = Math.sqrt(m.unscaledValue);
                m.y2 = Math.sqrt(m.destination);
                m.stepSize = (m.y2 - m.y1) / m.numSegmentSamps;
            },

            gen: function (numSamps, idx, buffer, m) {
                var val = m.unscaledValue,
                    y1 = m.y1;

                for (var i = idx; i < numSamps + idx; i++) {
                    buffer[i] = val;
                    y1 += m.stepSize;
                    val = y1 * y1;
                }

                m.y1 = y1;
                m.unscaledValue = val;

                return buffer;
            }
        },

        cubed: {
            init: function (m) {
                var third = 0.3333333333333333;
                m.y1 = Math.pow(m.unscaledValue, third);
                m.y2 = Math.pow(m.destination, third);
                m.stepSize = (m.y2 - m.y1) / m.numSegmentSamps;
            },

            gen: function (numSamps, idx, buffer, m) {
                var val = m.unscaledValue,
                    y1 = m.y1;

                for (var i = idx; i < numSamps + idx; i++) {
                    buffer[i] = val;
                    y1 += m.stepSize;
                    val = y1 * y1 * y1;
                }

                m.y1 = y1;
                m.unscaledValue = val;

                return buffer;
            }
        }
    };

    // Unsupported API.
    flock.line.fill.model = {
        unscaledValue: 0.0,
        value: 0.0,
        destination: 1.0
    };

    /****************************
     * Envelope Unit Generators *
     ****************************/

    flock.ugen.line = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                stepSize = m.stepSize,
                numSteps = m.numSteps,
                numLevelVals = numSteps >= numSamps ? numSamps : numSteps,
                numEndVals = numSamps - numLevelVals,
                level = m.level,
                out = that.output,
                i;

            for (i = 0; i < numLevelVals; i++) {
                out[i] = level;
                numSteps--;
                level += stepSize;
            }

            // TODO: Implement a more efficient gen algorithm when the line has finished.
            if (numEndVals > 0) {
                for (i = 0; i < numEndVals; i++) {
                    out[i] = level;
                }
            }

            // TODO: "level" should be deprecated in favour of "unscaledValue"
            m.level = m.unscaledValue = level;
            m.numSteps = numSteps;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged = function () {
            var m = that.model;

            // Any change in input value will restart the line.
            m.start = that.inputs.start.output[0];
            m.end = that.inputs.end.output[0];
            m.numSteps = Math.round(that.inputs.duration.output[0] * m.sampleRate);
            if (m.numSteps === 0) {
                m.stepSize = 0.0;
                m.level = m.end;
            } else {
                m.stepSize = (m.end - m.start) / m.numSteps;
                m.level = m.start;
            }

            flock.onMulAddInputChanged(that);
        };

        that.onInputChanged();
        return that;
    };

    fluid.defaults("flock.ugen.line", {
        rate: "control",
        inputs: {
            start: 0.0,
            end: 1.0,
            duration: 1.0,
            mul: null,
            add: null
        },
        ugenOptions: {
            model: {
                start: 0.0,
                end: 1.0,
                numSteps: 0,
                stepSize: 0,
                level: 0.0,
                unscaledValue: 0.0,
                value: 0.0
            }
        }
    });


    flock.ugen.xLine = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                multiplier = m.multiplier,
                numSteps = m.numSteps,
                numLevelVals = numSteps >= numSamps ? numSamps : numSteps,
                numEndVals = numSamps - numLevelVals,
                level = m.level,
                out = that.output,
                i;

            for (i = 0; i < numLevelVals; i++) {
                out[i] = level;
                numSteps--;
                level *= multiplier;
            }

            // TODO: Implement a more efficient gen algorithm when the line has finished.
            if (numEndVals > 0) {
                for (i = 0; i < numEndVals; i++) {
                    out[i] = level;
                }
            }

            // TODO: "level" should be deprecated in favour of "unscaledValue"
            m.level = m.unscaledValue = level;
            m.numSteps = numSteps;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged = function () {
            var m = that.model;

            flock.onMulAddInputChanged(that);

            // Any change in input value will restart the line.
            m.start = that.inputs.start.output[0];
            if (m.start === 0.0) {
                m.start = 1e-101; // Guard against divide by zero.
            }

            m.end = that.inputs.end.output[0];
            m.numSteps = Math.round(that.inputs.duration.output[0] * m.sampleRate);
            m.multiplier = Math.pow(m.end / m.start, 1.0 / m.numSteps);
            m.level = m.start;
        };

        that.onInputChanged();
        return that;
    };

    fluid.defaults("flock.ugen.xLine", {
        rate: "control",
        inputs: {
            start: 0.0,
            end: 1.0,
            duration: 1.0,
            mul: null,
            add: null
        },
        ugenOptions: {
            model: {
                start: 0.0,
                end: 1.0,
                numSteps: 0,
                multiplier: 0,
                level: 0.0,
                unscaledValue: 0.0,
                value: 0.0
            }
        }
    });

    flock.ugen.asr = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                out = that.output,
                prevGate = m.previousGate,
                gate = that.inputs.gate.output[0],
                level = m.level,
                stage = m.stage,
                currentStep = stage.currentStep,
                stepInc = stage.stepInc,
                numSteps = stage.numSteps,
                targetLevel = m.targetLevel,
                stepsNeedRecalc = false,
                stageTime,
                i;

            // Recalculate the step state if necessary.
            if (prevGate <= 0 && gate > 0) {
                // Starting a new attack stage.
                targetLevel = that.inputs.sustain.output[0];
                stageTime = that.inputs.attack.output[0];
                stepsNeedRecalc = true;
            } else if (gate <= 0 && currentStep >= numSteps) {
                // Starting a new release stage.
                targetLevel = that.inputs.start.output[0];
                stageTime = that.inputs.release.output[0];
                stepsNeedRecalc = true;
            }

            // TODO: Can we get rid of this extra branch without introducing code duplication?
            if (stepsNeedRecalc) {
                numSteps = Math.round(stageTime * m.sampleRate);
                stepInc = (targetLevel - level) / numSteps;
                currentStep = 0;
            }

            // Output the the envelope's sample data.
            for (i = 0; i < numSamps; i++) {
                out[i] = level;
                currentStep++;
                // Hold the last value if the stage is complete, otherwise increment.
                level = currentStep < numSteps ?
                    level + stepInc : currentStep === numSteps ?
                    targetLevel : level;
            }

            // Store instance state.
            // TODO: "level" should be deprecated in favour of "unscaledValue"
            m.level = m.unscaledValue = level;
            m.targetLevel = targetLevel;
            m.previousGate = gate;
            stage.currentStep = currentStep;
            stage.stepInc = stepInc;
            stage.numSteps = numSteps;

            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.init = function () {
            var m = that.model;
            m.level = m.unscaledValue = that.inputs.start.output[0];
            m.targetLevel = that.inputs.sustain.output[0];

            that.onInputChanged();
        };

        that.init();
        return that;
    };

    fluid.defaults("flock.ugen.asr", {
        rate: "control",
        inputs: {
            start: 0.0,
            attack: 0.01,
            sustain: 1.0,
            release: 1.0,
            gate: 0.0,
            mul: null,
            add: null
        },
        ugenOptions: {
            model: {
                level: 0.0,
                targetLevel: 0.0,
                previousGate: 0.0,
                unscaledValue: 0.0,
                value: 0.0,
                stage: {
                    currentStep: 0,
                    stepInc: 0,
                    numSteps: 0
                }
            }
        }
    });

    // Included for backwards compatibility.
    // The name "flock.ugen.env.simpleASR is deprecated.
    // Please use flock.ugen.asr instead.
    // This will be removed before Flocking 1.0.
    flock.ugen.env = {};
    flock.ugen.env.simpleASR  = flock.ugen.asr;
    fluid.defaults("flock.ugen.env.simpleASR", fluid.copy(fluid.defaults("flock.ugen.asr")));

    flock.ugen.envGen = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.krGen = function (numSamps) {
            var m = that.model,
                out = that.output,
                inputs = that.inputs,
                gate = inputs.gate.output[0],
                timeScale = inputs.timeScale.output[0],
                i = 0,
                sampsToGen;

            flock.ugen.envGen.checkGate(that, gate, timeScale);

            while (i < numSamps) {
                sampsToGen = Math.min(numSamps - i, m.numSegmentSamps);
                that.lineGen.gen(sampsToGen, i, out, m);
                i += sampsToGen;
                m.numSegmentSamps -= sampsToGen;

                if (m.numSegmentSamps === 0) {
                    flock.ugen.envGen.nextStage(that, timeScale);
                }
            }

            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.arGen = function (numSamps) {
            var m = that.model,
                out = that.output,
                inputs = that.inputs,
                gate = inputs.gate.output,
                timeScale = inputs.timeScale.output[0],
                i;

            for (i = 0; i < numSamps; i++) {
                flock.ugen.envGen.checkGate(that, gate[i], timeScale);

                that.lineGen.gen(1, i, out, m);
                m.numSegmentSamps--;

                if (m.numSegmentSamps === 0) {
                    flock.ugen.envGen.nextStage(that, timeScale);
                }
            }

            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged = function (inputName) {
            if (!inputName || inputName === "envelope") {
                that.envelope = flock.ugen.envGen.initEnvelope(that, that.inputs.envelope);
            }

            if (!inputName || inputName === "gate") {
                that.gen = that.inputs.gate.rate === flock.rates.AUDIO ? that.arGen : that.krGen;
            }

            flock.onMulAddInputChanged(that);
        };

        that.onInputChanged();

        return that;
    };

    // Unsupported API.
    flock.ugen.envGen.initEnvelope = function (that, envSpec) {
        var m = that.model,
            envelope = flock.envelope.expand(envSpec);

        m.stage = 0;
        m.numStages = envelope.times.length;
        that.lineGen = flock.line.constant;

        flock.ugen.envGen.lineGenForStage(that.inputs.timeScale.output[0], envelope, m);
        m.unscaledValue = envelope.levels[m.stage];

        return envelope;
    };

    // Unsupported API.
    flock.ugen.envGen.checkGate = function (that, gate, timeScale) {
        var m = that.model,
            envelope = that.envelope;

        if (gate !== m.previousGate) {
            if (gate > 0.0 && m.previousGate <= 0.0) {
                // Gate has opened.
                m.stage = 1;
                that.lineGen = flock.ugen.envGen.lineGenForStage(timeScale, envelope, m);
            } else if (gate <= 0.0 && m.previousGate > 0) {
                // Gate has closed.
                m.stage = m.numStages;
                that.lineGen = flock.ugen.envGen.lineGenForStage(timeScale, envelope, m);
            }
        }
        m.previousGate = gate;
    };

    // Unsupported API.
    flock.ugen.envGen.nextStage = function (that, timeScale) {
        var m = that.model,
            envelope = that.envelope;

        // We've hit the end of the current transition.
        if (m.stage === envelope.sustainPoint) {
            // We're at the sustain point.
            // Output a constant value.
            that.lineGen = flock.line.constant;
            m.numSegmentSamps = Infinity;
            m.destination = m.unscaledValue;
        } else {
            // Move on to the next breakpoint stage.
            m.stage++;
            that.lineGen = flock.ugen.envGen.lineGenForStage(timeScale, envelope, m);
        }
    };

    // Unsupported API.
    flock.ugen.envGen.setupStage = function (timeScale, envelope, m) {
        var dest = envelope.levels[m.stage],
            dur,
            durSamps;

        if (m.stage === 0 || m.stage > m.numStages) {
            durSamps = Infinity;
        } else {
            dur = envelope.times[m.stage - 1] * timeScale;
            durSamps = Math.max(1, dur * m.sampleRate);
        }

        m.numSegmentSamps = durSamps;
        m.destination = dest;
    };

    // Unsupported API.
    flock.ugen.envGen.lineGenForStage = function (timeScale, envelope, m) {
        var curve = envelope.curve,
            lineGen,
            curveValue;

        if (m.stage === 0 || m.stage > m.numStages) {
            lineGen = flock.line.constant;
        } else {
            curveValue = curve[m.stage - 1];
            m.currentCurve = curveValue;
            lineGen = flock.line.generator(curveValue);
        }

        flock.ugen.envGen.setupStage(timeScale, envelope, m);
        lineGen.init(m);

        return lineGen;
    };

    fluid.defaults("flock.ugen.envGen", {
        rate: "audio",

        inputs: {
            envelope: "flock.envelope.adsr",
            gate: 0.0,
            timeScale: 1.0,     // Timescale is control-rate (or lower) only.
            mul: null,          // This is equivalent to SC's levelScale parameter.
            add: null           // And this to SC's levelBias.
        },

        ugenOptions: {
            model: {
                previousGate: 0.0,
                stepSize: 0.0,
                destination: 0.0,
                numSegmentSamps: 1.0,
                unscaledValue: 0.0,
                value: 0.0,
                stage: 0.0,
                numStages: 0.0
            }
        }
    });


    /**
     * Loops through a linear ramp from start to end, incrementing the output by step.
     * Equivalent to SuperCollider's or CSound's Phasor unit generator.
     *
     * Inputs:
     *  start: the value to start ramping from
     *  end: the value to ramp to
     *  step: the value to increment per sample
     *  reset: the value to return to when the loop is reset by a trigger signal
     *  trigger: a trigger signal that, when it cross the zero line, will reset the loop back to the reset point
     */
    flock.ugen.phasor = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                inputs = that.inputs,
                out = that.output,
                step = inputs.step.output,
                trig = inputs.trigger.output,
                i,
                j,
                k;

            // TODO: Add sample priming to the ugen graph to remove this conditional.
            if (m.unscaledValue === undefined) {
                m.unscaledValue = inputs.start.output[0];
            }

            for (i = 0, j = 0, k = 0; i < numSamps; i++, j += m.strides.trigger, k += m.strides.step) {
                if ((trig[j] > 0.0 && m.prevTrig <= 0.0)) {
                    m.unscaledValue = inputs.reset.output[0];
                }
                m.prevTrig = trig[j];

                if (m.unscaledValue >= inputs.end.output[0]) {
                    m.unscaledValue = inputs.start.output[0];
                }

                out[i] = m.unscaledValue;
                m.unscaledValue += step[k]; // TODO: Model out of sync with last output sample.
            }

            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged();

        return that;
    };

    fluid.defaults("flock.ugen.phasor", {
        rate: "control",
        inputs: {
            start: 0.0,
            end: 1.0,
            reset: 0.0,
            step: 0.1,
            trigger: 0.0,
            mul: null,
            add: null
        },
        ugenOptions: {
            model: {
                unscaledValue: undefined,
                value: 0.0
            },

            strideInputs: [
                "trigger",
                "step"
            ]
        }
    });

}());
;/*
 * Flocking Filters
 * http://github.com/colinbdclark/flocking
 *
 * Copyright 2011-2015, Colin Clark
 * Dual licensed under the MIT and GPL Version 2 licenses.
 */

/*global require*/
/*jshint white: false, newcap: true, regexp: true, browser: true,
    forin: false, nomen: true, bitwise: false, maxerr: 100,
    indent: 4, plusplus: false, curly: true, eqeqeq: true,
    freeze: true, latedef: true, noarg: true, nonew: true, quotmark: double, undef: true,
    unused: true, strict: true, asi: false, boss: false, evil: false, expr: false,
    funcscope: false*/

var fluid = fluid || require("infusion"),
    flock = fluid.registerNamespace("flock");

(function () {
    "use strict";

    var Filter = flock.requireModule("webarraymath", "Filter");

    flock.ugen.lag = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                out = that.output,
                inputs = that.inputs,
                time = inputs.time.output[0],
                source = inputs.source.output,
                prevSamp = m.prevSamp,
                lagCoef = m.lagCoef,
                i,
                j,
                currSamp,
                outVal;

            if (time !== m.prevTime) {
                m.prevtime = time;
                lagCoef = m.lagCoef = time === 0 ? 0.0 : Math.exp(flock.LOG001 / (time * m.sampleRate));
            }

            for (i = j = 0; i < numSamps; i++, j += m.strides.source) {
                currSamp = source[j];
                outVal = currSamp + lagCoef * (prevSamp - currSamp);
                out[i] = prevSamp = outVal;
            }

            m.prevSamp = prevSamp;

            that.mulAdd(numSamps);
        };

        that.onInputChanged();
        return that;
    };

    fluid.defaults("flock.ugen.lag", {
        rate: "audio",
        inputs: {
            source: null,
            time: 0.1
        },
        ugenOptions: {
            strideInputs: ["source"],
            model: {
                prevSamp: 0.0,
                lagCoef: 0.0,
                prevTime: 0.0
            }
        }
    });


    /**
     * A generic FIR and IIR filter engine. You specify the coefficients, and this will do the rest.
     */
     // TODO: Unit tests.
    flock.ugen.filter = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function () {
            var m = that.model,
                out = that.output,
                inputs = that.inputs,
                q = inputs.q.output[0],
                freq = inputs.freq.output[0];

            if (m.prevFreq !== freq || m.prevQ !== q) {
                that.updateCoefficients(m, freq, q);
            }

            that.filterEngine.filter(out, that.inputs.source.output);

            m.prevQ = q;
            m.prevFreq = freq;
            m.value = m.unscaledValue = out[out.length - 1];
        };

        that.init = function () {
            var recipeOpt = that.options.recipe;
            var recipe = typeof (recipeOpt) === "string" ? flock.get(recipeOpt) : recipeOpt;

            if (!recipe) {
                throw new Error("Can't instantiate a flock.ugen.filter() without specifying a filter coefficient recipe.");
            }

            that.filterEngine = new Filter(recipe.sizes.b, recipe.sizes.a);
            that.model.coeffs = {
                a: that.filterEngine.a,
                b: that.filterEngine.b
            };

            that.updateCoefficients = flock.get(recipe, that.options.type);
            that.onInputChanged();
        };

        that.init();
        return that;
    };

    fluid.defaults("flock.ugen.filter", {
        rate: "audio",

        inputs: {
            freq: 440,
            q: 1.0,
            source: null
        }
    });

    /**
     * An optimized biquad filter unit generator.
     */
    // TODO: Unit tests.
    flock.ugen.filter.biquad = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                inputs = that.inputs,
                out = that.output,
                co = m.coeffs,
                freq = inputs.freq.output[0],
                q = inputs.q.output[0],
                source = inputs.source.output,
                i,
                w;

            if (m.prevFreq !== freq || m.prevQ !== q) {
                that.updateCoefficients(m, freq, q);
            }

            for (i = 0; i < numSamps; i++) {
                w = source[i] - co.a[0] * m.d0 - co.a[1] * m.d1;
                out[i] = co.b[0] * w + co.b[1] * m.d0 + co.b[2] * m.d1;
                m.d1 = m.d0;
                m.d0 = w;
            }

            m.prevQ = q;
            m.prevFreq = freq;
            m.value = m.unscaledValue = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged = function () {
            var typeOpt = that.options.type;
            that.updateCoefficients = typeof (typeOpt) === "string" ?
                flock.get(typeOpt) : typeOpt;
        };

        that.init = function () {
            that.model.d0 = 0.0;
            that.model.d1 = 0.0;
            that.model.coeffs = {
                a: new Float32Array(2),
                b: new Float32Array(3)
            };
            that.onInputChanged();
        };

        that.init();
        return that;
    };

    fluid.defaults("flock.ugen.filter.biquad", {
        inputs: {
            freq: 440,
            q: 1.0,
            source: null
        }
    });

    flock.ugen.filter.biquad.types = {
        "hp": {
            inputDefaults: {
                freq: 440,
                q: 1.0
            },
            options: {
                type: "flock.coefficients.butterworth.highPass"
            }
        },
        "rhp": {
            inputDefaults: {
                freq: 440,
                q: 1.0
            },
            options: {
                type: "flock.coefficients.rbj.highPass"
            }
        },
        "lp": {
            inputDefaults: {
                freq: 440,
                q: 1.0
            },
            options: {
                type: "flock.coefficients.butterworth.lowPass"
            }
        },
        "rlp": {
            inputDefaults: {
                freq: 440,
                q: 1.0
            },
            options: {
                type: "flock.coefficients.rbj.lowPass"
            }
        },
        "bp": {
            inputDefaults: {
                freq: 440,
                q: 4.0
            },
            options: {
                type: "flock.coefficients.butterworth.bandPass"
            }
        },
        "br": {
            inputDefaults: {
                freq: 440,
                q: 1.0
            },
            options: {
                type: "flock.coefficients.butterworth.bandReject"
            }
        }
    };

    // Convenience methods for instantiating common types of biquad filters.
    flock.aliasUGens("flock.ugen.filter.biquad", flock.ugen.filter.biquad.types);

    flock.coefficients = {
        butterworth: {
            sizes: {
                a: 2,
                b: 3
            },

            lowPass: function (model, freq) {
                var co = model.coeffs;
                var lambda = 1 / Math.tan(Math.PI * freq / model.sampleRate);
                var lambdaSquared = lambda * lambda;
                var rootTwoLambda = flock.ROOT2 * lambda;
                var b0 = 1 / (1 + rootTwoLambda + lambdaSquared);
                co.b[0] = b0;
                co.b[1] = 2 * b0;
                co.b[2] = b0;
                co.a[0] = 2 * (1 - lambdaSquared) * b0;
                co.a[1] = (1 - rootTwoLambda + lambdaSquared) * b0;
            },

            highPass: function (model, freq) {
                var co = model.coeffs;
                var lambda = Math.tan(Math.PI * freq / model.sampleRate);
                // Works around NaN values in cases where the frequency
                // is precisely half the sampling rate, and thus lambda
                // is Infinite.
                if (lambda === Infinity) {
                    lambda = 0;
                }
                var lambdaSquared = lambda * lambda;
                var rootTwoLambda = flock.ROOT2 * lambda;
                var b0 = 1 / (1 + rootTwoLambda + lambdaSquared);

                co.b[0] = b0;
                co.b[1] = -2 * b0;
                co.b[2] = b0;
                co.a[0] = 2 * (lambdaSquared - 1) * b0;
                co.a[1] = (1 - rootTwoLambda + lambdaSquared) * b0;
            },

            bandPass: function (model, freq, q) {
                var co = model.coeffs;
                var bw = freq / q;
                var lambda = 1 / Math.tan(Math.PI * bw / model.sampleRate);
                var theta = 2 * Math.cos(flock.TWOPI * freq / model.sampleRate);
                var b0 = 1 / (1 + lambda);

                co.b[0] = b0;
                co.b[1] = 0;
                co.b[2] = -b0;
                co.a[0] = -(lambda * theta * b0);
                co.a[1] = b0 * (lambda - 1);
            },

            bandReject: function (model, freq, q) {
                var co = model.coeffs;
                var bw = freq / q;
                var lambda = Math.tan(Math.PI * bw / model.sampleRate);
                var theta = 2 * Math.cos(flock.TWOPI * freq / model.sampleRate);
                var b0 = 1 / (1 + lambda);
                var b1 = -theta * b0;

                co.b[0] = b0;
                co.b[1] = b1;
                co.b[2] = b0;
                co.a[0] = b1;
                co.a[1] = (1 - lambda) * b0;
            }
        },

        // From Robert Brisow-Johnston's Filter Cookbook:
        // http://dspwiki.com/index.php?title=Cookbook_Formulae_for_audio_EQ_biquad_filter_coefficients
        rbj: {
            sizes: {
                a: 2,
                b: 3
            },

            lowPass: function (model, freq, q) {
                var co = model.coeffs;
                var w0 = flock.TWOPI * freq / model.sampleRate;
                var cosw0 = Math.cos(w0);
                var sinw0 = Math.sin(w0);
                var alpha = sinw0 / (2 * q);
                var oneLessCosw0 = 1 - cosw0;
                var a0 = 1 + alpha;
                var b0 = (oneLessCosw0 / 2) / a0;

                co.b[0] = b0;
                co.b[1] = oneLessCosw0 / a0;
                co.b[2] = b0;
                co.a[0] = (-2 * cosw0) / a0;
                co.a[1] = (1 - alpha) / a0;
            },

            highPass: function (model, freq, q) {
                var co = model.coeffs;
                var w0 = flock.TWOPI * freq / model.sampleRate;
                var cosw0 = Math.cos(w0);
                var sinw0 = Math.sin(w0);
                var alpha = sinw0 / (2 * q);
                var onePlusCosw0 = 1 + cosw0;
                var a0 = 1 + alpha;
                var b0 = (onePlusCosw0 / 2) / a0;

                co.b[0] = b0;
                co.b[1] = (-onePlusCosw0) / a0;
                co.b[2] = b0;
                co.a[0] = (-2 * cosw0) / a0;
                co.a[1] = (1 - alpha) / a0;
            },

            bandPass: function (model, freq, q) {
                var co = model.coeffs;
                var w0 = flock.TWOPI * freq / model.sampleRate;
                var cosw0 = Math.cos(w0);
                var sinw0 = Math.sin(w0);
                var alpha = sinw0 / (2 * q);
                var a0 = 1 + alpha;
                var qByAlpha = q * alpha;

                co.b[0] = qByAlpha / a0;
                co.b[1] = 0;
                co.b[2] = -qByAlpha / a0;
                co.a[0] = (-2 * cosw0) / a0;
                co.a[1] = (1 - alpha) / a0;
            },

            bandReject: function (model, freq, q) {
                var co = model.coeffs;
                var w0 = flock.TWOPI * freq / model.sampleRate;
                var cosw0 = Math.cos(w0);
                var sinw0 = Math.sin(w0);
                var alpha = sinw0 / (2 * q);
                var a0 = 1 + alpha;
                var ra0 = 1 / a0;
                var b1 = (-2 * cosw0) / a0;
                co.b[0] = ra0;
                co.b[1] = b1;
                co.b[2] = ra0;
                co.a[0] = b1;
                co.a[1] = (1 - alpha) / a0;
            }
        }
    };

    /**
     * A Moog-style 24db resonant low-pass filter.
     *
     * This unit generator is based on the following musicdsp snippet:
     * http://www.musicdsp.org/showArchiveComment.php?ArchiveID=26
     *
     * Inputs:
     *   - source: the source signal to process
     *   - cutoff: the cutoff frequency
     *   - resonance: the filter resonance [between 0 and 4, where 4 is self-oscillation]
     */
    // TODO: Unit tests.
    flock.ugen.filter.moog = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                inputs = that.inputs,
                out = that.output,
                source = inputs.source.output,
                sourceInc = m.strides.source,
                res = inputs.resonance.output,
                resInc = m.strides.resonance,
                cutoff = inputs.cutoff.output,
                cutoffInc = m.strides.cutoff,
                f = m.f,
                fSq = m.fSq,
                fSqSq = m.fSqSq,
                oneMinusF = m.oneMinusF,
                fb = m.fb,
                i,
                j,
                k,
                l,
                currCutoff,
                currRes,
                val;

            for (i = j = k = l = 0; i < numSamps; i++, j += sourceInc, k += resInc, l += cutoffInc) {
                currCutoff = cutoff[l];
                currRes = res[k];

                if (currCutoff !== m.prevCutoff) {
                    if (currCutoff > m.nyquistRate) {
                        currCutoff = m.nyquistRate;
                    }

                    f = m.f = (currCutoff / m.nyquistRate) * 1.16;
                    fSq = m.fSq = f * f;
                    fSqSq = m.fSqSq = fSq * fSq;
                    oneMinusF = m.oneMinusF = 1 - f;
                    m.prevRes = undefined; // Flag the need to update fb.
                }

                if (currRes !== m.prevRes) {
                    if (currRes > 4) {
                        currRes = 4;
                    } else if (currRes < 0) {
                        currRes = 0;
                    }

                    fb = m.fb = currRes * (1.0 - 0.15 * fSq);
                }

                val = source[j] - (m.out4 * fb);
                val *= 0.35013 * fSqSq;
                m.out1 = val + 0.3 * m.in1 + oneMinusF * m.out1;
                m.in1 = val;
                m.out2 = m.out1 + 0.3 * m.in2 + oneMinusF * m.out2;
                m.in2 = m.out1;
                m.out3 = m.out2 + 0.3 * m.in3 + oneMinusF * m.out3;
                m.in3 = m.out2;
                m.out4 = m.out3 + 0.3 * m.in4 + oneMinusF * m.out4;
                m.in4 = m.out3;
                out[i] = m.out4;
            }

            m.unscaledValue = m.out4;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged();
        return that;
    };

    fluid.defaults("flock.ugen.filter.moog", {
        rate: "audio",
        inputs: {
            cutoff: 3000,
            resonance: 3.99,
            source: null
        },
        ugenOptions: {
            model: {
                in1: 0.0,
                in2: 0.0,
                in3: 0.0,
                in4: 0.0,
                out1: 0.0,
                out2: 0.0,
                out3: 0.0,
                out4: 0.0,
                prevCutoff: undefined,
                prevResonance: undefined,
                f: undefined,
                fSq: undefined,
                fSqSq: undefined,
                oneMinusF: undefined,
                fb: undefined,
                unscaledValue: 0.0,
                value: 0.0
            },
            strideInputs: ["source", "cutoff", "resonance"]
        }
    });

    flock.ugen.delay = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                inputs = that.inputs,
                out = that.output,
                source = inputs.source.output,
                time = inputs.time.output[0],
                delayBuffer = that.delayBuffer,
                i,
                val;

            if (time !== m.time) {
                m.time = time;
                m.delaySamps = time * that.model.sampleRate;
            }

            for (i = 0; i < numSamps; i++) {
                if (m.pos >= m.delaySamps) {
                    m.pos = 0;
                }
                out[i] = val = delayBuffer[m.pos];
                delayBuffer[m.pos] = source[i];
                m.pos++;
            }

            m.unscaledValue = val;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged = function (inputName) {
            flock.onMulAddInputChanged(that);

            if (!inputName || inputName === "maxTime") {
                var delayBufferLength = that.model.sampleRate * that.inputs.maxTime.output[0];
                that.delayBuffer = new Float32Array(delayBufferLength);
            }
        };

        that.onInputChanged();
        return that;
    };

    fluid.defaults("flock.ugen.delay", {
        rate: "audio",
        inputs: {
            maxTime: 1.0,
            time: 1.0,
            source: null
        },
        ugenOptions: {
            model: {
                pos: 0,
                unscaledValue: 0.0,
                value: 0.0
            }
        }
    });


    // Simple optimised delay for exactly 1 sample
    flock.ugen.delay1 = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                inputs = that.inputs,
                out = that.output,
                source = inputs.source.output,
                prevVal = m.prevVal,
                i,
                val;

            for (i = 0; i < numSamps; i++) {
                out[i] = val = prevVal;
                prevVal = source[i];
            }

            m.prevVal = prevVal;
            m.unscaledValue = val;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged = function () {
            flock.onMulAddInputChanged(that);
        };

        that.onInputChanged();
        return that;
    };

    fluid.defaults("flock.ugen.delay1", {
        rate: "audio",
        inputs: {
            source: null
        },
        ugenOptions: {
            model: {
                prevVal: 0.0,
                unscaledValue: 0.0,
                value: 0.0
            }
        }
    });


    flock.ugen.freeverb = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);
        that.tunings = that.options.tunings;
        that.allpassTunings = that.options.allpassTunings;

        that.gen = function (numSamps) {
            var m = that.model,
                inputs = that.inputs,
                out = that.output,
                source = inputs.source.output,
                mix = inputs.mix.output[0],
                dry = 1 - mix,
                roomsize = inputs.room.output[0],
                room_scaled = roomsize * 0.28 + 0.7,
                damp = inputs.damp.output[0],
                damp1 = damp * 0.4,
                damp2 = 1.0 - damp1,
                i,
                j,
                val;

            for (i = 0; i < numSamps; i++) {
                // read inputs
                var inp = source[i];
                var inp_scaled = inp * 0.015;

                // read samples from the allpasses
                for (j = 0; j < that.buffers_a.length; j++) {
                    if (++that.bufferindices_a[j] === that.allpassTunings[j]) {
                        that.bufferindices_a[j] = 0;
                    }
                    that.readsamp_a[j] = that.buffers_a[j][that.bufferindices_a[j]];
                }

                // foreach comb buffer, we perform same filtering (only bufferlen differs)
                for (j = 0; j < that.buffers_c.length; j++) {
                    if (++that.bufferindices_c[j] === that.tunings[j]) {
                        that.bufferindices_c[j] = 0;
                    }
                    var bufIdx_c = that.bufferindices_c[j],
                        readsamp_c = that.buffers_c[j][bufIdx_c];
                    that.filterx_c[j] = (damp2 * that.filtery_c[j]) + (damp1 * that.filterx_c[j]);
                    that.buffers_c[j][bufIdx_c] = inp_scaled + (room_scaled * that.filterx_c[j]);
                    that.filtery_c[j] = readsamp_c;
                }

                // each allpass is handled individually,
                // with different calculations made and stored into the delaylines
                var ftemp8 = (that.filtery_c[6] + that.filtery_c[7]);

                that.buffers_a[3][that.bufferindices_a[3]] = ((((0.5 * that.filterx_a[3]) + that.filtery_c[0]) +
                    (that.filtery_c[1] + that.filtery_c[2])) +
                    ((that.filtery_c[3] + that.filtery_c[4]) + (that.filtery_c[5] + ftemp8)));
                that.filterx_a[3] = that.readsamp_a[3];
                that.filtery_a[3] = (that.filterx_a[3] - (((that.filtery_c[0] + that.filtery_c[1]) +
                    (that.filtery_c[2] + that.filtery_c[3])) +
                    ((that.filtery_c[4] + that.filtery_c[5]) + ftemp8)));
                that.buffers_a[2][that.bufferindices_a[2]] = ((0.5 * that.filterx_a[2]) + that.filtery_a[3]);
                that.filterx_a[2] = that.readsamp_a[2];
                that.filtery_a[2] = (that.filterx_a[2] - that.filtery_a[3]);

                that.buffers_a[1][that.bufferindices_a[1]] = ((0.5 * that.filterx_a[1]) + that.filtery_a[2]);
                that.filterx_a[1] = that.readsamp_a[1];
                that.filtery_a[1] = (that.filterx_a[1] - that.filtery_a[2]);

                that.buffers_a[0][that.bufferindices_a[0]] = ((0.5 * that.filterx_a[0]) + that.filtery_a[1]);
                that.filterx_a[0] = that.readsamp_a[0];
                that.filtery_a[0] = (that.filterx_a[0] - that.filtery_a[1]);
                val = ((dry * inp) + (mix * that.filtery_a[0]));
                out[i] = val;
            }

            m.unscaledValue = val;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.initDelayLines = function () {
            // Initialise the delay lines
            that.buffers_c = new Array(8);
            that.bufferindices_c = new Int32Array(8);
            that.filterx_c = new Float32Array(8);
            that.filtery_c = new Float32Array(8);
            var spread = that.model.spread;
            var i, j;
            for(i = 0; i < that.buffers_c.length; i++) {
                that.buffers_c[i] = new Float32Array(that.tunings[i]+spread);
                that.bufferindices_c[i] = 0;
                that.filterx_c[i] = 0;
                that.filtery_c[i] = 0;
                for(j = 0; j < that.tunings[i]+spread; j++) {
                    that.buffers_c[i][j] = 0;
                }
            }
            that.buffers_a = new Array(4);
            that.bufferindices_a = new Int32Array(4);
            that.filterx_a = new Float32Array(4);
            that.filtery_a = new Float32Array(4);
            // "readsamp" vars are temporary values read back from the delay lines,
            // not stored but only used in the gen loop
            that.readsamp_a = new Float32Array(4);
            for (i = 0; i < that.buffers_a.length; i++) {
                that.bufferindices_a[i] = 0;
                that.filterx_a[i] = 0;
                that.filtery_a[i] = 0;
                that.readsamp_a[i] = 0;
                // TODO is this what the spread is meant to do?
                for (j = 0; j < that.allpassTunings.length; j++) {
                    that.allpassTunings[j] += spread;
                }
                that.buffers_a[i] = new Float32Array(that.allpassTunings[i]);
                for (j = 0; j < that.allpassTunings[i]; j++) {
                    that.buffers_a[i][j] = 0;
                }
            }
        };

        that.init = function () {
            that.initDelayLines();
            that.onInputChanged();
        };

        that.init();
        return that;
    };

    fluid.defaults("flock.ugen.freeverb", {
        rate: "audio",
        inputs: {
            source: null,
            mix: 0.33,
            room: 0.5,
            damp: 0.5
        },
        ugenOptions: {
            model: {
                spread: 0,
                unscaledValue: 0.0,
                value: 0.0
            },

            tunings: [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617],
            allpassTunings: [556, 441, 341, 225]
        }
    });

    
    flock.ugen.decay = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                inputs = that.inputs,
                out = that.output,
                source = inputs.source.output,
                time = inputs.time.output[0],
                i,
                val;

            if (time !== m.time) {
                m.time = time;
                m.coeff = time === 0.0 ? 0.0 : Math.exp(flock.LOG001 / (time * that.model.sampleRate));
            }

            // TODO: Optimize this conditional.
            if (m.coeff === 0.0) {
                for (i = 0; i < numSamps; i++) {
                    out[i] = val = source[i];
                }
            } else {
                for (i = 0; i < numSamps; i++) {
                    m.lastSamp = source[i] + m.coeff * m.lastSamp;
                    out[i] = val = m.lastSamp;
                }
            }

            m.unscaledValue = val;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged();
        return that;
    };

    fluid.defaults("flock.ugen.decay", {
        rate: "audio",
        inputs: {
            source: null,
            time: 1.0
        },
        ugenOptions: {
            model: {
                time: 0,
                lastSamp: 0,
                coeff: 0,
                value: 0.0
            }
        }
    });

}());
;/*
 * Flocking Gate Unit Generators
 * http://github.com/colinbdclark/flocking
 *
 * Copyright 2011-2014, Colin Clark
 * Dual licensed under the MIT and GPL Version 2 licenses.
 */

/*global require*/
/*jshint white: false, newcap: true, regexp: true, browser: true,
    forin: false, nomen: true, bitwise: false, maxerr: 100,
    indent: 4, plusplus: false, curly: true, eqeqeq: true,
    freeze: true, latedef: true, noarg: true, nonew: true, quotmark: double, undef: true,
    unused: true, strict: true, asi: false, boss: false, evil: false, expr: false,
    funcscope: false*/

var fluid = fluid || require("infusion"),
    flock = fluid.registerNamespace("flock");

(function () {
    "use strict";

    /**
     * A gate that allows the source input signal to pass whenever the sideChain input
     * signal is greater than the threshold.
     *
     * If sideChain isn't specifed, the source signal itself is used to open the gate.
     * By default, the gate will output 0.0 if it is closed, but setting the holdLastValue
     * option to true enables it to hold the value of the gate when it was last open.
     *
     * Inputs:
     *     source: the signal that will be outputted whenever the gate is open.
     *     sideChain: (optional) a side chain signal that will
     *         cause the gate to open and close
     *     threshold: the minimum value at which the gate will open
     * Options:
     *      holdLastValue: determines whether the gate should hold its last open value or output silence
     */
    flock.ugen.gate = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                strides = m.strides,
                out = that.output,
                inputs = that.inputs,
                source = inputs.source.output,
                sideChain = inputs.sideChain.output,
                sideChainInc = strides.sideChain,
                threshold = inputs.threshold.output,
                thresholdInc = strides.threshold,
                holdLast = that.options.holdLastValue,
                lastValue = m.lastValue,
                i,
                j,
                k,
                val;

            for (i = j = k = 0; i < numSamps; i++, j += sideChainInc, k += thresholdInc) {
                if (sideChain[j] >= threshold[k]) {
                    out[i] = val = lastValue = source[i];
                } else {
                    // TODO: Don't check holdLast on each sample.
                    out[i] = val = holdLast ? lastValue : 0;
                }
            }

            m.lastValue = lastValue;
            m.unscaledValue = val;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged = function () {
            if (!that.inputs.sideChain) {
                that.inputs.sideChain = that.inputs.source;
            }

            flock.onMulAddInputChanged(that);
            that.calculateStrides();
        };

        that.onInputChanged();
        return that;
    };

    fluid.defaults("flock.ugen.gate", {
        rate: "audio",
        inputs: {
            source: null,
            sideChain: null,
            threshold: Number.MIN_VALUE,
            mul: null,
            add: null
        },
        ugenOptions: {
            model: {
                unscaledValue: 0.0,
                value: 0.0,
                lastValue: 0.0
            },
            holdLastValue: false,
            strideInputs: ["sideChain", "threshold"]
        }
    });

    /**
     * A triggerable timed gate.
     *
     * This unit generator will output 1.0 for the specified
     * duration whenever it is triggered.
     *
     * Similar to SuperCollider's Trig1 unit generator.
     *
     * Inputs:
     *     duration: the duration (in seconds) to remain open
     *     trigger: a trigger signal that will cause the gate to open
     */
    // TODO: Unit tests!
    flock.ugen.timedGate = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                out = that.output,
                trigger = that.inputs.trigger.output,
                duration = that.inputs.duration.output[0],
                currentTrig,
                i,
                j,
                val;

            if (duration !== m.duration) {
                m.duration = duration;
                m.durationSamps = Math.floor(duration * m.sampleRate);
            }

            for (i = j = 0; i < numSamps; i++, j += m.strides.trigger) {
                currentTrig = trigger[j];
                if (currentTrig > 0.0 && m.prevTrigger <= 0.0) {
                    // If we're already open, close the gate for one sample.
                    val = that.options.resetOnTrigger && m.sampsRemaining > 0 ? 0.0 : 1.0;
                    m.sampsRemaining = m.durationSamps;
                } else {
                    val = m.sampsRemaining > 0 ? 1.0 : 0.0;
                }

                out[i] = val;
                m.sampsRemaining--;

                m.prevTrigger = currentTrig;
            }

            m.unscaledValue = val;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.init = function () {
            that.onInputChanged();
        };

        that.init();
        return that;
    };

    fluid.defaults("flock.ugen.timedGate", {
        rate: "audio",
        inputs: {
            trigger: 0.0,
            duration: 1.0
        },
        ugenOptions: {
            model: {
                unscaledValue: 0.0,
                value: 0.0,
                prevTrigger: 0.0,
                sampsRemaining: 0,
                durationSamps: 0,
                duration: 0.0
            },
            resetOnTrigger: true,
            strideInputs: ["trigger"]
        }
    });

    flock.ugen.latch = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.arGen = function (numSamps) {
            var m = that.model,
                inputs = that.inputs,
                source = inputs.source.output,
                trig = inputs.trigger,
                sourceInc = m.strides.source,
                out = that.output,
                i, j,
                currTrig,
                val;

            if (m.holdVal === undefined) {
                m.holdVal = source[0];
            }

            for (i = 0, j = 0; i < numSamps; i++, j += sourceInc) {
                currTrig = trig.output[i];
                out[i] = val = (currTrig > 0.0 && m.prevTrig <= 0.0) ? m.holdVal = source[j] : m.holdVal;
                m.prevTrig = currTrig;
            }

            m.unscaledValue = val;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.krGen = function (numSamps) {
            var m = that.model,
                out = that.output,
                currTrig = that.inputs.trigger.output[0],
                i;

            if (m.holdVal === undefined || currTrig > 0.0 && m.prevTrig <= 0.0) {
                m.holdVal = that.inputs.source.output[0];
            }
            m.prevTrig = currTrig;

            for (i = 0; i < numSamps; i++) {
                out[i] = m.holdVal;
            }

            m.unscaledValue = m.holdVal;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged = function () {
            that.calculateStrides();
            that.gen = that.inputs.trigger.rate === flock.rates.AUDIO ? that.arGen : that.krGen;
            flock.onMulAddInputChanged(that);
        };

        that.onInputChanged();
        return that;
    };

    fluid.defaults("flock.ugen.latch", {
        rate: "audio",
        inputs: {
            source: null,
            trigger: 0.0,
            mul: null,
            add: null
        },
        ugenOptions: {
            strideInputs: ["source"],
            model: {
                prevTrig: 0.0,
                unscaledValue: 0.0,
                value: 0.0
            }
        }
    });

}());
;/*
 * Flocking Granular Synthesis Unit Generators
 * http://github.com/colinbdclark/flocking
 *
 * Copyright 2011-2015, Colin Clark
 * Dual licensed under the MIT and GPL Version 2 licenses.
 */

/*global require*/
/*jshint white: false, newcap: true, regexp: true, browser: true,
    forin: false, nomen: true, bitwise: false, maxerr: 100,
    indent: 4, plusplus: false, curly: true, eqeqeq: true,
    freeze: true, latedef: true, noarg: true, nonew: true, quotmark: double, undef: true,
    unused: true, strict: true, asi: false, boss: false, evil: false, expr: false,
    funcscope: false*/

var fluid = fluid || require("infusion"),
    flock = fluid.registerNamespace("flock");

(function () {
    "use strict";

    /**
     * Triggers grains from an audio buffer.
     *
     * Inputs:
     *   - dur: the duration of each grain (control or constant rate only)
     *   - trigger: a trigger signal that, when it move to a positive number, will start a grain
     *   - buffer: a bufferDef object describing the buffer to granulate
     *   - centerPos: the postion within the sound buffer when the grain will reach maximum amplitude
     *   - amp: the peak amplitude of the grain
     *   - speed: the rate at which grain samples are selected from the buffer; 1.0 is normal speed, -1.0 is backwards
     *
     * Options:
     *   - interpolation: "cubic", "linear", or "none"/undefined
     */
    // TODO: Unit tests.
    flock.ugen.triggerGrains = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                inputs = that.inputs,
                out = that.output,
                chan = inputs.channel.output[0],
                buf = that.buffer.data.channels[chan],
                bufRate = that.buffer.format.sampleRate,
                dur = inputs.dur.output[0],
                amp = inputs.amp.output,
                centerPos = inputs.centerPos.output,
                trigger = inputs.trigger.output,
                speed = inputs.speed.output,
                grainEnv = that.options.grainEnv,
                lastOutIdx = numSamps - 1,
                posIdx = 0,
                trigIdx = 0,
                ampIdx = 0,
                speedIdx = 0,
                i,
                j,
                k,
                grain,
                start,
                samp,
                env;

            // Trigger new grains.
            for (i = 0; i < numSamps; i++) {
                if (trigger[trigIdx] > 0.0 && m.prevTrigger <= 0.0 && m.activeGrains.length < m.maxNumGrains) {
                    grain = m.freeGrains.pop();
                    grain.numSamps = m.sampleRate * dur;
                    grain.centerIdx = (grain.numSamps / 2) * m.stepSize;
                    grain.envScale = that.options.grainEnv.length / grain.numSamps;
                    grain.sampIdx = 0;
                    grain.amp = amp[ampIdx];
                    start = (centerPos[posIdx] * bufRate) - grain.centerIdx;
                    while (start < 0) {
                        start += buf.length;
                    }
                    grain.readPos = start;
                    grain.writePos = i;
                    grain.speed = speed[speedIdx];
                    m.activeGrains.push(grain);
                }

                m.prevTrigger = trigger[trigIdx];
                out[i] = 0.0;

                posIdx += m.strides.centerPos;
                trigIdx += m.strides.trigger;
                ampIdx += m.strides.amp;
                speedIdx += m.strides.speed;
            }

            // Output samples for all active grains.
            for (j = 0; j < m.activeGrains.length;) {
                grain = m.activeGrains[j];
                for (k = grain.writePos; k < Math.min(k + (grain.numSamps - grain.sampIdx), numSamps); k++) {
                    samp = that.interpolate(grain.readPos, buf);
                    env = flock.interpolate.linear(grain.sampIdx * grain.envScale, grainEnv);
                    out[k] += samp * env * grain.amp;
                    grain.readPos = (grain.readPos + (m.stepSize * grain.speed)) % buf.length;
                    grain.sampIdx++;
                }
                if (grain.sampIdx >= grain.numSamps) {
                    m.freeGrains.push(grain);
                    m.activeGrains.splice(j, 1);
                } else {
                    j++;
                    grain.writePos = k % numSamps;
                }
            }

            m.unscaledValue = out[lastOutIdx];
            that.mulAdd(numSamps);
            m.value = out[lastOutIdx];
        };

        that.onBufferReady = function () {
            var m = that.model;
            m.stepSize = that.buffer.format.sampleRate / m.sampleRate;
        };

        that.onInputChanged = function (inputName) {
            that.onBufferInputChanged(inputName);
            that.calculateStrides();
            flock.onMulAddInputChanged(that);
        };

        that.allocateGrains = function (numGrains) {
            numGrains = numGrains || that.model.maxNumGrains;

            for (var i = 0; i < numGrains; i++) {
                that.model.freeGrains.push({
                    numSamps: 0,
                    centerIdx: 0.0,
                    envScale: 0.0,
                    sampIdx: 0,
                    amp: 0.0,
                    readPos: 0.0,
                    writePos: 0,
                    speed: 0.0
                });
            }
        };

        that.init = function () {
            flock.ugen.buffer(that);
            that.allocateGrains();
            that.initBuffer();
            that.onInputChanged();
        };

        that.init();
        return that;
    };

    fluid.defaults("flock.ugen.triggerGrains", {
        rate: "audio",
        inputs: {
            centerPos: 0,
            channel: 0,
            amp: 1.0,
            dur: 0.1,
            speed: 1.0,
            trigger: 0.0,
            buffer: null,
            mul: null,
            add: null
        },
        ugenOptions: {
            grainEnv: flock.fillTable(8192, flock.tableGenerators.hann),
            model: {
                unscaledValue: 0.0,
                value: 0.0,
                maxNumGrains: 512,
                activeGrains: [],
                freeGrains: [],
                env: null,
                strides: {}
            },
            strideInputs: [
                "centerPos",
                "trigger",
                "amp",
                "speed"
            ],
            interpolation: "cubic"
        }
    });


    /**
     * Granulates a source signal using an integral delay line.
     * This implementation is particularly useful for live granulation.
     * Contributed by Mayank Sanganeria.
     *
     * Inputs:
     *   - grainDur: the duration of each grain (control or constant rate only)
     *   - delayDur: the duration of the delay line (control or constant rate only)
     *   - numGrains: the number of grains to generate (control or constant rate only)
     *   - mul: amplitude scale factor
     *   - add: amplide add
     */
    // TODO: Unit tests.
    flock.ugen.granulator = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                o = that.options,
                inputs = that.inputs,
                out = that.output,
                delayLine = that.delayLine,
                grainDur = inputs.grainDur.output[0],
                delayDur = inputs.delayDur.output[0],
                numGrains = inputs.numGrains.output[0],
                source = inputs.source.output,
                maxDelayDur = o.maxDelayDur,
                grainEnv = o.grainEnv,
                i,
                j,
                val,
                grainIdx,
                delayLineReadIdx,
                samp,
                windowPos,
                amp;

            // Update and clamp the delay line length.
            if (m.delayDur !== delayDur) {
                m.delayDur = delayDur;

                if (delayDur > maxDelayDur) {
                    delayDur = maxDelayDur;
                }

                m.delayLength = (delayDur * m.sampleRate) | 0;
                m.writePos = m.writePos % m.delayLength;
            }

            // Update the grain duration.
            if (m.grainDur !== grainDur) {
                m.grainDur = grainDur;
                m.grainLength = (m.sampleRate * m.grainDur) | 0;
                m.envScale = grainEnv.length / m.grainLength;
            }

            // TODO: This implementation will cause currently-sounding grains
            // to be stopped immediately, rather than being allowed to finish.
            numGrains = numGrains > o.maxNumGrains ? o.maxNumGrains : Math.round(numGrains);

            for (i = 0; i < numSamps; i++) {
                // Write into the delay line and update the write position.
                delayLine[m.writePos] = source[i];
                m.writePos = ++m.writePos % m.delayLength;

                // Clear the previous output.
                val = 0;

                // Now fill with grains
                for (j = 0; j < numGrains; j++) {
                    grainIdx = m.grainIdx[j];
                    delayLineReadIdx = m.delayLineIdx[j];

                    // Randomize the reset position of finished grains.
                    if (grainIdx > m.grainLength) {
                        grainIdx = 0;
                        delayLineReadIdx = (Math.random() * m.delayLength) | 0;
                    }

                    samp = delayLine[delayLineReadIdx];
                    windowPos = grainIdx * m.envScale;
                    amp = flock.interpolate.linear(windowPos, grainEnv);
                    val += samp * amp;

                    // Update positions in the delay line and grain envelope arrays for next time.
                    m.delayLineIdx[j] = ++delayLineReadIdx % m.delayLength;
                    m.grainIdx[j] = ++grainIdx;
                }

                val = val / numGrains;
                out[i] = val;
            }

            m.unscaledValue = val;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.initGrains = function () {
            var m = that.model;

            for (var i = 0; i < that.options.maxNumGrains; i++) {
                m.grainIdx[i] = 0;
                m.delayLineIdx[i] = Math.random() * m.delayLength;
            }
        };

        that.init = function () {
            var m = that.model,
                o = that.options,
                delayLineLen = (o.maxDelayDur * m.sampleRate) | 0;

            that.delayLine = new Float32Array(delayLineLen);
            m.delayLength = delayLineLen;
            m.delayLineIdx = new Uint32Array(o.maxNumGrains);
            m.grainIdx = new Uint32Array(o.maxNumGrains);

            that.initGrains();
            that.onInputChanged();
        };

        that.init();

        return that;
    };

    fluid.defaults("flock.ugen.granulator", {
        rate: "audio",

        inputs: {
            source: null,
            grainDur: 0.1,
            delayDur: 1,
            numGrains: 5,
            mul: null,
            add: null
        },

        ugenOptions: {
            maxNumGrains: 512,
            maxDelayDur: 30,
            grainEnv: flock.fillTable(8192, flock.tableGenerators.sinWindow),
            model: {
                unscaledValue: 0.0,
                value: 0.0,
                grainLength: 0,
                writePos: 0
            }
        }
    });

}());
;/*
 * Flocking Listening Unit Generators
 * http://github.com/colinbdclark/flocking
 *
 * Copyright 2011-2014, Colin Clark
 * Dual licensed under the MIT and GPL Version 2 licenses.
 */

/*global require*/
/*jshint white: false, newcap: true, regexp: true, browser: true,
    forin: false, nomen: true, bitwise: false, maxerr: 100,
    indent: 4, plusplus: false, curly: true, eqeqeq: true,
    freeze: true, latedef: true, noarg: true, nonew: true, quotmark: double, undef: true,
    unused: true, strict: true, asi: false, boss: false, evil: false, expr: false,
    funcscope: false*/

var fluid = fluid || require("infusion"),
    flock = fluid.registerNamespace("flock");

(function () {
    "use strict";

    flock.ugen.amplitude = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                source = that.inputs.source.output,
                out = that.output,
                prevAtt = m.attackTime,
                nextAtt = that.inputs.attack.output[0],
                prevRel = m.releaseTime,
                nextRel = that.inputs.release.output[0],
                prevVal = m.prevVal,
                attCoef = m.attackCoef,
                relCoef = m.releaseCoef,
                i,
                val,
                coef;

            // Convert 60 dB attack and release times to coefficients if they've changed.
            if (nextAtt !== prevAtt) {
                m.attackTime = nextAtt;
                attCoef = m.attackCoef =
                    nextAtt === 0.0 ? 0.0 : Math.exp(flock.LOG01 / (nextAtt * m.sampleRate));
            }

            if (nextRel !== prevRel) {
                m.releaseTime = nextRel;
                relCoef = m.releaseCoef =
                    (nextRel === 0.0) ? 0.0 : Math.exp(flock.LOG01 / (nextRel * m.sampleRate));
            }

            for (i = 0; i < numSamps; i++) {
                val = Math.abs(source[i]);
                coef = val < prevVal ? relCoef : attCoef;
                out[i] = prevVal = val + (prevVal - val) * coef;
            }

            m.unscaledValue = m.prevVal = prevVal;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged();
        return that;
    };

    fluid.defaults("flock.ugen.amplitude", {
        rate: "audio",
        inputs: {
            source: null,
            attack: 0.01,
            release: 0.01,
            mul: null,
            add: null
        },
        ugenOptions: {
            model: {
                prevVal: 0.0,
                unscaledValue: 0.0,
                value: 0.0
            }
        }
    });

}());
;/*
 * Flocking Math Unit Generators
 * http://github.com/colinbdclark/flocking
 *
 * Copyright 2011-2014, Colin Clark
 * Dual licensed under the MIT and GPL Version 2 licenses.
 */

/*global require, Float32Array*/
/*jshint white: false, newcap: true, regexp: true, browser: true,
    forin: false, nomen: true, bitwise: false, maxerr: 100,
    indent: 4, plusplus: false, curly: true, eqeqeq: true,
    freeze: true, latedef: true, noarg: true, nonew: true, quotmark: double, undef: true,
    unused: true, strict: true, asi: false, boss: false, evil: false, expr: false,
    funcscope: false*/

var fluid = fluid || require("infusion"),
    flock = fluid.registerNamespace("flock");

(function () {
    "use strict";

    var ArrayMath = flock.requireModule("webarraymath", "ArrayMath");

    flock.ugen.math = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);
        that.expandedRight = new Float32Array(that.options.audioSettings.blockSize);

        that.krSourceKrInputGen = function () {
            var m = that.model,
                op = that.activeInput,
                input = that.inputs[op],
                out = that.output,
                left = that.inputs.source.output[0],
                right = flock.generate(that.expandedRight, input.output[0]);

            ArrayMath[op](out, left, right);
            m.value = m.unscaledValue = out[out.length - 1];
        };

        that.krSourceArInputGen = function () {
            var m = that.model,
                op = that.activeInput,
                input = that.inputs[op],
                out = that.output,
                left = that.inputs.source.output[0],
                right = input.output;

            ArrayMath[op](out, left, right);
            m.value = m.unscaledValue = out[out.length - 1];
        };

        that.arSourceKrInputGen = function () {
            var m = that.model,
                op = that.activeInput,
                input = that.inputs[op],
                out = that.output,
                left = that.inputs.source.output,
                right = flock.generate(that.expandedRight, input.output[0]);

            ArrayMath[op](out, left, right);
            m.value = m.unscaledValue = out[out.length - 1];
        };

        that.arSourceArInputGen = function () {
            var m = that.model,
                op = that.activeInput,
                input = that.inputs[op],
                out = that.output,
                left = that.inputs.source.output,
                right = input.output;

            ArrayMath[op](out, left, right);
            m.value = m.unscaledValue = out[out.length - 1];
        };

        that.onInputChanged = function () {
            // Find the first input and use it. Multiple inputters, beware.
            // TODO: Support multiple operations.
            var inputs = Object.keys(that.inputs),
                i,
                input,
                isInputAudioRate;

            for (i = 0; i < inputs.length; i++) {
                input = inputs[i];
                if (input !== "source") {
                    that.activeInput = input;
                    isInputAudioRate = that.inputs[input].rate === "audio";
                    that.gen = that.inputs.source.rate === "audio" ?
                        (isInputAudioRate ? that.arSourceArInputGen : that.arSourceKrInputGen) :
                        (isInputAudioRate ? that.krSourceArInputGen : that.krSourceKrInputGen);
                    break;
                }
            }
        };

        that.init = function () {
            if (typeof (ArrayMath) === "undefined") {
                throw new Error("ArrayMath is undefined. Please include webarraymath.js to use the flock.math unit generator.");
            }
            that.onInputChanged();
        };

        that.init();
        return that;
    };

    fluid.defaults("flock.ugen.math", {
        rate: "audio",
        inputs: {
            // Any Web Array Math operator is supported as an input.
            source: null
        }
    });


    flock.ugen.sum = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.copyGen = function (numSamps) {
            var m = that.model,
                out = that.output,
                source = that.inputs.sources.output,
                i;

            for (i = 0; i < numSamps; i++) {
                out[i] = source[i];
            }

            m.value = m.unscaledValue = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.sumGen = function (numSamps) {
            var m = that.model,
                sources = that.inputs.sources,
                out = that.output,
                i,
                sourceIdx,
                sum;

            for (i = 0; i < numSamps; i++) {
                sum = 0;
                for (sourceIdx = 0; sourceIdx < sources.length; sourceIdx++) {
                    sum += sources[sourceIdx].output[i];
                }
                out[i] = sum;
            }

            m.value = m.unscaledValue = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged = function () {
            if (typeof (that.inputs.sources.length) === "number") {
                // We have an array of sources that need to be summed.
                that.gen = that.sumGen;
            } else {
                that.gen = that.copyGen;
            }
        };

        that.onInputChanged();
        return that;
    };

    fluid.defaults("flock.ugen.sum", {
        rate: "audio",
        inputs: {
            sources: null
        }
    });

}());
;/*
 * Flocking MIDI Unit Generators
 * http://github.com/colinbdclark/flocking
 *
 * Copyright 2011-2014, Colin Clark
 * Dual licensed under the MIT and GPL Version 2 licenses.
 */

/*global require*/
/*jshint white: false, newcap: true, regexp: true, browser: true,
    forin: false, nomen: true, bitwise: false, maxerr: 100,
    indent: 4, plusplus: false, curly: true, eqeqeq: true,
    freeze: true, latedef: true, noarg: true, nonew: true, quotmark: double, undef: true,
    unused: true, strict: true, asi: false, boss: false, evil: false, expr: false,
    funcscope: false*/

var fluid = fluid || require("infusion"),
    flock = fluid.registerNamespace("flock");

(function () {
    "use strict";

    flock.ugen.midiFreq = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                a4 = m.a4,
                a4Freq = a4.freq,
                a4NoteNum = a4.noteNum,
                notesPerOctave = m.notesPerOctave,
                noteNum = that.inputs.note.output,
                out = that.output,
                i,
                j,
                val;

            for (i = 0, j = 0; i < numSamps; i++, j += m.strides.note) {
                out[i] = val = flock.midiFreq(noteNum[j], a4Freq, a4NoteNum, notesPerOctave);
            }

            m.unscaledValue = val;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.init = function () {
            that.model.octaveScale = 1 / that.model.notesPerOctave;
            that.onInputChanged();
        };

        that.init();
        return that;
    };

    fluid.defaults("flock.ugen.midiFreq", {
        rate: "control",
        inputs: {
            note: 69
        },
        ugenOptions: {
            model: {
                unscaledValue: 0.0,
                value: 0.0,
                a4: {
                    noteNum: 69,
                    freq: 440
                },
                notesPerOctave: 12
            },
            strideInputs: [
                "note"
            ]
        }
    });


    flock.ugen.midiAmp = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                velocity = that.inputs.velocity.output,
                out = that.output,
                i,
                j,
                val;

            for (i = 0, j = 0; i < numSamps; i++, j += m.strides.velocity) {
                out[i] = val = velocity[j] / 127;
            }

            m.unscaledValue = val;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.init = function () {
            that.onInputChanged();
        };

        that.init();
        return that;
    };

    fluid.defaults("flock.ugen.midiAmp", {
        rate: "control",
        inputs: {
            velocity: 0
        },
        ugenOptions: {
            model: {
                unscaledValue: 0.0,
                value: 0.0
            },
            strideInputs: ["velocity"]
        }
    });

}());
;/*
 * Flocking Multichannel Unit Generators
 * http://github.com/colinbdclark/flocking
 *
 * Copyright 2011-2014, Colin Clark
 * Dual licensed under the MIT and GPL Version 2 licenses.
 */

/*global require*/
/*jshint white: false, newcap: true, regexp: true, browser: true,
    forin: false, nomen: true, bitwise: false, maxerr: 100,
    indent: 4, plusplus: false, curly: true, eqeqeq: true,
    freeze: true, latedef: true, noarg: true, nonew: true, quotmark: double, undef: true,
    unused: true, strict: true, asi: false, boss: false, evil: false, expr: false,
    funcscope: false*/

var fluid = fluid || require("infusion"),
    flock = fluid.registerNamespace("flock");

(function () {
    "use strict";

    /**
     * An equal power stereo panner.
     *
     * This unit generator scales the left and right channels
     * with a quarter-wave sin/cos curve so that the levels at the centre
     * are more balanced than a linear pan, reducing the impression that
     * the sound is fading into the distance as it reaches the centrepoint.
     *
     * Inputs:
     *   source: the source (mono) unit signal
     *   pan: a value between -1 (hard left) and 1 (hard right)
     */
    flock.ugen.pan2 = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                outputs = that.output,
                left = outputs[0],
                right = outputs[1],
                inputs = that.inputs,
                source = inputs.source.output,
                pan = inputs.pan.output,
                i,
                j,
                sourceVal,
                panVal;

            for (i = 0, j = 0; i < numSamps; i++, j += m.strides.pan) {
                sourceVal = source[i];
                panVal = pan[j] * 0.5 + 0.5;

                // TODO: Replace this with a lookup table.
                right[i] = sourceVal * Math.sin(panVal * flock.HALFPI);
                left[i] = sourceVal * Math.cos(panVal * flock.HALFPI);
            }

            // TODO: Add multichannel support for mul/add.
            var lastIdx = numSamps - 1;
            m.value[0] = outputs[0][lastIdx];
            m.value[1] = outputs[1][lastIdx];
        };

        that.init = function () {
            that.onInputChanged();
            that.model.unscaledValue = that.model.value;
        };

        that.init();
        return that;
    };

    fluid.defaults("flock.ugen.pan2", {
        rate: "audio",

        inputs: {
            source: null,
            pan: 0 // -1 (hard left)..0 (centre)..1 (hard right)
        },

        ugenOptions: {
            model: {
                unscaledValue: [0.0, 0.0],
                value: [0.0, 0.0]
            },
            tags: ["flock.ugen.multiChannelOutput"],
            strideInputs: [
                "pan"
            ],
            numOutputs: 2
        }
    });

}());
;/*
 * Flocking Oscillator Unit Generators
 * http://github.com/colinbdclark/flocking
 *
 * Copyright 2011-2015, Colin Clark
 * Dual licensed under the MIT and GPL Version 2 licenses.
 */

/*global require*/
/*jshint white: false, newcap: true, regexp: true, browser: true,
    forin: false, nomen: true, bitwise: false, maxerr: 100,
    indent: 4, plusplus: false, curly: true, eqeqeq: true,
    freeze: true, latedef: true, noarg: true, nonew: true, quotmark: double, undef: true,
    unused: true, strict: true, asi: false, boss: false, evil: false, expr: false,
    funcscope: false*/

var fluid = fluid || require("infusion"),
    flock = fluid.registerNamespace("flock");

(function () {
    "use strict";

    flock.ugen.osc = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                inputs = that.inputs,
                freq = inputs.freq.output,
                phaseOffset = inputs.phase.output,
                table = inputs.table,
                tableLen = m.tableLen,
                tableIncHz = m.tableIncHz,
                tableIncRad = m.tableIncRad,
                out = that.output,
                phase = m.phase,
                i,
                j,
                k,
                idx,
                val;

            for (i = 0, j = 0, k = 0; i < numSamps; i++, j += m.strides.phase, k += m.strides.freq) {
                idx = phase + phaseOffset[j] * tableIncRad;
                if (idx >= tableLen) {
                    idx -= tableLen;
                } else if (idx < 0) {
                    idx += tableLen;
                }
                out[i] = val = that.interpolate(idx, table);
                phase += freq[k] * tableIncHz;
                if (phase >= tableLen) {
                    phase -= tableLen;
                } else if (phase < 0) {
                    phase += tableLen;
                }
            }

            m.phase = phase;
            m.unscaledValue = val;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged = function (inputName) {
            flock.ugen.osc.onInputChanged(that);

            // Precalculate table-related values.
            if (!inputName || inputName === "table") {
                var m = that.model,
                    table = that.inputs.table;

                if (table.length < 1) {
                    table = that.inputs.table = flock.ugen.osc.emptyTable;
                }

                m.tableLen = table.length;
                m.tableIncHz = m.tableLen / m.sampleRate;
                m.tableIncRad =  m.tableLen / flock.TWOPI;
            }
        };

        that.onInputChanged();
        return that;
    };

    flock.ugen.osc.emptyTable = new Float32Array([0, 0, 0]);

    flock.ugen.osc.onInputChanged = function (that) {
        that.calculateStrides();
        flock.onMulAddInputChanged(that);
    };

    fluid.defaults("flock.ugen.osc", {
        rate: "audio",
        inputs: {
            freq: 440.0,
            phase: 0.0,
            table: [],
            mul: null,
            add: null
        },
        ugenOptions: {
            interpolation: "linear",
            model: {
                phase: 0.0,
                unscaledValue: 0.0,
                value: 0.0
            },
            strideInputs: [
                "freq",
                "phase"
            ]
        },
        tableSize: 8192
    });

    flock.ugen.osc.define = function (name, tableFillFn) {
        var lastSegIdx = name.lastIndexOf("."),
            namespace = name.substring(0, lastSegIdx),
            oscName = name.substring(lastSegIdx + 1),
            namespaceObj = flock.get(namespace);

        namespaceObj[oscName] = function (inputs, output, options) {
            // TODO: Awkward options pre-merging. Refactor osc API.
            var defaults = fluid.defaults("flock.ugen.osc"),
                merged = fluid.merge(null, defaults, options),
                s = merged.tableSize;
            inputs.table = flock.fillTable(s, tableFillFn);
            return flock.ugen.osc(inputs, output, options);
        };

        fluid.defaults(name, fluid.defaults("flock.ugen.osc"));
    };

    flock.ugen.osc.define("flock.ugen.sinOsc", flock.tableGenerators.sin);
    flock.ugen.osc.define("flock.ugen.triOsc", flock.tableGenerators.tri);
    flock.ugen.osc.define("flock.ugen.sawOsc", flock.tableGenerators.saw);
    flock.ugen.osc.define("flock.ugen.squareOsc", flock.tableGenerators.square);


    flock.ugen.sin = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                freq = that.inputs.freq.output,
                phaseOffset = that.inputs.phase.output,
                out = that.output,
                phase = m.phase,
                sampleRate = m.sampleRate,
                i,
                j,
                k,
                val;

            for (i = 0, j = 0, k = 0; i < numSamps; i++, j += m.strides.phase, k += m.strides.freq) {
                out[i] = val = Math.sin(phase + phaseOffset[j]);
                phase += freq[k] / sampleRate * flock.TWOPI;
            }

            m.phase = phase;
            m.unscaledValue = val;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged = function () {
            flock.ugen.osc.onInputChanged(that);
        };

        that.onInputChanged();
        return that;
    };

    fluid.defaults("flock.ugen.sin", {
        rate: "audio",
        inputs: {
            freq: 440.0,
            phase: 0.0,
            mul: null,
            add: null
        },
        ugenOptions: {
            model: {
                phase: 0.0,
                unscaledValue: 0.0,
                value: 0.0
            },
            strideInputs: [
                "freq",
                "phase"
            ]
        }
    });


    flock.ugen.lfSaw = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                freq = that.inputs.freq.output,
                out = that.output,
                scale = m.scale,
                phaseOffset = that.inputs.phase.output[0], // Phase is control rate
                phase = m.phase, // TODO: Prime synth graph on instantiation.
                i,
                j,
                val;

            for (i = 0, j = 0; i < numSamps; i++, j += m.strides.freq) {
                out[i] = val = phase + phaseOffset;
                phase += freq[j] * scale;
                if (phase >= 1.0) {
                    phase -= 2.0;
                } else if (phase <= -1.0) {
                    phase += 2.0;
                }
            }

            m.phase = phase;
            m.unscaledValue = val;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged = function () {
            var m = that.model;
            m.freqInc = that.inputs.freq.rate === flock.rates.AUDIO ? 1 : 0;
            m.phase = 0.0;
            that.calculateStrides();
            flock.onMulAddInputChanged(that);
        };

        that.init = function () {
            that.model.scale = 2 * (1 / that.options.sampleRate);
            that.onInputChanged();
        };

        that.init();
        return that;
    };

    fluid.defaults("flock.ugen.lfSaw", {
        rate: "audio",
        inputs: {
            freq: 440,
            phase: 0.0,
            mul: null,
            add: null
        },
        ugenOptions: {
            model: {
                phase: 0.0,
                freqInc: 1,
                unscaledValue: 0.0,
                value: 0.0
            },
            strideInputs: ["freq"]
        }
    });


    flock.ugen.lfPulse = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var inputs = that.inputs,
                m = that.model,
                freq = inputs.freq.output,
                freqInc = m.freqInc,
                width = inputs.width.output[0], // TODO: Are we handling width correctly here?
                out = that.output,
                scale = m.scale,
                phase = m.phase !== undefined ? m.phase : inputs.phase.output[0], // TODO: Unnecessary if we knew the synth graph had been primed.
                i,
                j,
                val;

            for (i = 0, j = 0; i < numSamps; i++, j += freqInc) {
                if (phase >= 1.0) {
                    phase -= 1.0;
                    out[i] = val = width < 0.5 ? 1.0 : -1.0;
                } else {
                    out[i] = val = phase < width ? 1.0 : -1.0;
                }
                phase += freq[j] * scale;
            }

            m.phase = phase;
            m.unscaledValue = val;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged = function () {
            that.model.freqInc = that.inputs.freq.rate === flock.rates.AUDIO ? 1 : 0;
            flock.onMulAddInputChanged(that);
        };

        that.init = function () {
            that.model.scale = 1 / that.options.sampleRate;
            that.onInputChanged();
        };

        that.init();
        return that;
    };

    fluid.defaults("flock.ugen.lfPulse", {
        rate: "audio",
        inputs: {
            freq: 440,
            phase: 0.0,
            width: 0.5,
            mul: null,
            add: null
        },
        ugenOptions: {
            model: {
                phase: 0.0,
                freqInc: 1,
                unscaledValue: 0.0,
                value: 0.0
            }
        }
    });


    flock.ugen.impulse = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var inputs = that.inputs,
                m = that.model,
                out = that.output,
                freq = inputs.freq.output,
                freqInc = m.strides.freq,
                phaseOffset = inputs.phase.output[0],
                phase = m.phase,
                scale = m.scale,
                i,
                j,
                val;

            phase += phaseOffset;

            for (i = 0, j = 0; i < numSamps; i++, j += freqInc) {
                if (phase >= 1.0) {
                    phase -= 1.0;
                    val = 1.0;
                } else {
                    val = 0.0;
                }
                out[i] = val;
                phase += freq[j] * scale;
            }

            m.phase = phase - phaseOffset;
            m.unscaledValue = val;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged = function () {
            that.calculateStrides();
            flock.onMulAddInputChanged(that);
        };

        that.init = function () {
            that.model.scale = 1.0 / that.model.sampleRate;
            that.onInputChanged();
        };

        that.init();
        return that;
    };

    fluid.defaults("flock.ugen.impulse", {
        rate: "audio",
        inputs: {
            freq: 440,
            phase: 0.0,
            mul: null,
            add: null
        },
        ugenOptions: {
            model: {
                phase: 0.0,
                scale: 0.0,
                unscaledValue: 0.0,
                value: 0.0
            },
            strideInputs: ["freq"]
        }
    });

}());
;/*
 * Flocking Random Unit Generators
 * http://github.com/colinbdclark/flocking
 *
 * Copyright 2011-2014, Colin Clark
 * Dual licensed under the MIT and GPL Version 2 licenses.
 */

/*global require, Float32Array*/
/*jshint white: false, newcap: true, regexp: true, browser: true,
    forin: false, nomen: true, bitwise: false, maxerr: 100,
    indent: 4, plusplus: false, curly: true, eqeqeq: true,
    freeze: true, latedef: true, noarg: true, nonew: true, quotmark: double, undef: true,
    unused: true, strict: true, asi: false, boss: false, evil: false, expr: false,
    funcscope: false*/

var fluid = fluid || require("infusion"),
    flock = fluid.registerNamespace("flock");

(function () {
    "use strict";

    var Random = flock.requireModule("Random");

    flock.ugen.dust = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                out = that.output,
                density = inputs.density.output[0], // Density is kr.
                threshold,
                scale,
                rand,
                val,
                i;

            if (density !== m.density) {
                m.density = density;
                threshold = m.threshold = density * m.sampleDur;
                scale = m.scale = threshold > 0.0 ? 1.0 / threshold : 0.0;
            } else {
                threshold = m.threshold;
                scale = m.scale;
            }

            for (i = 0; i < numSamps; i++) {
                rand = Math.random();
                val = (rand < threshold) ? rand * scale : 0.0;
                out[i] = val;
            }

            m.unscaledValue = val;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged();
        return that;
    };

    fluid.defaults("flock.ugen.dust", {
        rate: "audio",
        inputs: {
            density: 1.0,
            mul: null,
            add: null
        },
        ugenOptions: {
            model: {
                density: 0.0,
                scale: 0.0,
                threshold: 0.0,
                unscaledValue: 0.0,
                value: 0.0
            }
        }
    });


    flock.ugen.whiteNoise = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                out = that.output,
                i,
                val;

            for (i = 0; i < numSamps; i++) {
                out[i] = val = Math.random();
            }

            m.unscaledValue = val;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged();
        return that;
    };

    fluid.defaults("flock.ugen.whiteNoise", {
        rate: "audio",
        inputs: {
            mul: null,
            add: null
        }
    });


    /**
     * Implements Larry Tramiel's first Pink Noise algorithm
     * described at http://home.earthlink.net/~ltrammell/tech/pinkalg.htm,
     * based on a version by David Lowenfels posted to musicdsp:
     * http://www.musicdsp.org/showone.php?id=220.
     */
    flock.ugen.pinkNoise = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                state = m.state,
                a = that.a,
                p = that.p,
                offset = m.offset,
                out = that.output,
                i,
                j,
                rand,
                val;

            for (i = 0; i < numSamps; i++) {
                val = 0;
                for (j = 0; j < state.length; j++) {
                    rand = Math.random();
                    state[j] = p[j] * (state[j] - rand) + rand;
                    val += a[j] * state[j];
                }
                val = val * 2 - offset;
                out[i] = val;
            }

            m.unscaledValue = val;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.init = function () {
            that.a = new Float32Array(that.options.coeffs.a);
            that.p = new Float32Array(that.options.coeffs.p);
            that.model.state = new Float32Array(that.a.length);

            for (var i = 0; i < that.a.length; i++) {
                that.model.offset += that.a[i];
            }

            that.onInputChanged();
        };

        that.init();
        return that;
    };

    fluid.defaults("flock.ugen.pinkNoise", {
        rate: "audio",
        inputs: {
            mul: null,
            add: null
        },
        ugenOptions: {
            model: {
                state: 0.0,
                unscaledValue: 0.0,
                value: 0.0,
                offset: 0
            },
            coeffs: {
                a: [0.02109238, 0.07113478, 0.68873558],
                p: [0.3190, 0.7756, 0.9613]
            }
        }
    });

    flock.ugen.lfNoise = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                freq = inputs.freq.output[0], // Freq is kr.
                remain = numSamps,
                out = that.output,
                currSamp = 0,
                sampsForLevel,
                i;

            freq = freq > 0.001 ? freq : 0.001;
            do {
                if (m.counter <= 0) {
                    m.counter = m.sampleRate / freq;
                    m.counter = m.counter > 1 ? m.counter : 1;
                    if (that.options.interpolation === "linear") {
                        m.start = m.unscaledValue = m.end;
                        m.end = Math.random();
                        m.ramp = m.ramp = (m.end - m.start) / m.counter;
                    } else {
                        m.start = m.unscaledValue = Math.random();
                        m.ramp = 0;
                    }
                }
                sampsForLevel = remain < m.counter ? remain : m.counter;
                remain -= sampsForLevel;
                m.counter -= sampsForLevel;
                for (i = 0; i < sampsForLevel; i++) {
                    out[currSamp] = m.unscaledValue;
                     // TODO: This reuse of "unscaledValue" will cause the model to be out of sync
                     // with the actual output of the unit generator.
                    m.unscaledValue += m.ramp;
                    currSamp++;
                }

            } while (remain);

            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.input = function () {
            that.model.end = Math.random();
            that.onInputChanged();
        };

        that.input();
        return that;
    };

    fluid.defaults("flock.ugen.lfNoise", {
        rate: "audio",
        inputs: {
            freq: 440,
            mul: null,
            add: null
        },
        ugenOptions: {
            model: {
                counter: 0,
                level: 0,
                unscaledValue: 0.0,
                value: 0.0
            }
        }
    });

    /*****************************************************
     * Random distributions using Sim.js' Random library *
     *****************************************************/

    // TODO: Unit tests.
    flock.ugen.random = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                generator = that.generator,
                out = that.output,
                i,
                val;

            for (i = 0; i < numSamps; i++) {
                out[i] = val = generator.uniform(-1, 1);
            }

            m.unscaledValue = val;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged = function (inputName) {
            if (inputName === "seed") {
                that.initGenerator();
            }
            flock.onMulAddInputChanged(that);
        };

        that.initGenerator = function () {
            var seed = that.inputs.seed;
            that.generator = seed ? new Random(seed) : new Random();
        };

        that.init = function () {
            that.initGenerator();
            that.calculateStrides();
            that.onInputChanged();
        };

        that.init();
        return that;
    };

    fluid.defaults("flock.ugen.random", {
        rate: "audio",
        inputs: {
            seed: null,
            mul: null,
            add: null
        }
    });

    // TODO: Unit tests.
    flock.ugen.random.exponential = function (inputs, output, options) {
        var that = flock.ugen.random(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                generator = that.generator,
                out = that.output,
                lambda = that.inputs.lambda.output,
                lambdaInc = that.model.strides.lambda,
                i,
                j,
                val;

            for (i = j = 0; i < numSamps; i++, j += lambdaInc) {
                out[i] = val = generator.exponential(lambda[j]);
            }

            m.unscaledValue = val;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        return that;
    };

    fluid.defaults("flock.ugen.random.exponential", {
        rate: "audio",
        inputs: {
            seed: null,
            lambda: 1,
            mul: null,
            add: null
        },

        ugenOptions: {
            strideInputs: ["lambda"]
        }
    });

    // TODO: Unit tests.
    flock.ugen.random.gamma = function (inputs, output, options) {
        var that = flock.ugen.random(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                inputs = that.inputs,
                generator = that.generator,
                out = that.output,
                alphaInc = m.strides.alpha,
                alpha = inputs.alpha.output,
                betaInc = m.strides.beta,
                beta = inputs.beta.output,
                i,
                j,
                k,
                val;

            for (i = j = k = 0; i < numSamps; i++, j += alphaInc, k += betaInc) {
                out[i] = val = generator.gamma(alpha[j], beta[k]);
            }

            m.unscaledValue = val;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        return that;
    };

    fluid.defaults("flock.ugen.random.gamma", {
        rate: "audio",
        inputs: {
            seed: null,
            alpha: 1,
            beta: 2,
            mul: null,
            add: null
        },

        ugenOptions: {
            strideInputs: ["alpha", "beta"]
        }
    });

    // TODO: Unit tests.
    flock.ugen.random.normal = function (inputs, output, options) {
        var that = flock.ugen.random(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                out = that.output,
                inputs = that.inputs,
                generator = that.generator,
                muInc = m.strides.mu,
                mu = inputs.mu.output,
                sigmaInc = m.strides.sigma,
                sigma = inputs.sigma.output,
                i,
                j,
                k,
                val;

            for (i = j = k = 0; i < numSamps; i++, j += muInc, k += sigmaInc) {
                out[i] = val = generator.normal(mu[j], sigma[k]);
            }

            m.unscaledValue = val;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        return that;
    };

    fluid.defaults("flock.ugen.random.normal", {
        rate: "audio",
        inputs: {
            seed: null,
            mu: 0,
            sigma: 1,
            mul: null,
            add: null
        },

        ugenOptions: {
            strideInputs: ["mu", "sigma"]
        }
    });

    // TODO: Unit tests.
    flock.ugen.random.pareto = function (inputs, output, options) {
        var that = flock.ugen.random(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                generator = that.generator,
                out = that.output,
                alphaInc = that.model.strides.alpha,
                alpha = that.inputs.alpha.output,
                i,
                j,
                val;

            for (i = j = 0; i < numSamps; i++, j += alphaInc) {
                out[i] = val = generator.pareto(alpha[j]);
            }

            m.unscaledValue = val;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        return that;
    };

    fluid.defaults("flock.ugen.random.pareto", {
        rate: "audio",
        inputs: {
            seed: null,
            alpha: 5,
            mul: null,
            add: null
        },

        ugenOptions: {
            strideInputs: ["alpha"]
        }
    });

    // TODO: Unit tests.
    flock.ugen.random.triangular = function (inputs, output, options) {
        var that = flock.ugen.random(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                generator = that.generator,
                out = that.output,
                modeInc = that.model.strides.mode,
                mode = that.inputs.mode.output,
                i,
                j,
                val;

            for (i = j = 0; i < numSamps; i++, j += modeInc) {
                out[i] = val = generator.triangular(-1, 1, mode[j]);
            }

            m.unscaledValue = val;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        return that;
    };

    fluid.defaults("flock.ugen.random.triangular", {
        rate: "audio",
        inputs: {
            seed: null,
            mode: 0.5,
            mul: null,
            add: null
        },

        ugenOptions: {
            strideInputs: ["mode"]
        }
    });

    // TODO: Unit tests.
    flock.ugen.random.weibull = function (inputs, output, options) {
        var that = flock.ugen.random(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                inputs = that.inputs,
                generator = that.generator,
                out = that.output,
                alphaInc = m.strides.alpha,
                alpha = inputs.alpha.output,
                betaInc = m.strides.beta,
                beta = inputs.beta.output,
                i,
                j,
                k,
                val;

            for (i = j = k = 0; i < numSamps; i++, j += alphaInc, k += betaInc) {
                out[i] = val = generator.weibull(alpha[j], beta[k]);
            }

            m.unscaledValue = val;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        return that;
    };

    fluid.defaults("flock.ugen.random.weibull", {
        rate: "audio",
        inputs: {
            seed: null,
            alpha: 1,
            beta: 1,
            mul: null,
            add: null
        },

        ugenOptions: {
            strideInputs: ["alpha", "beta"]
        }
    });

}());
;/*
 * Flocking Sequencing  Unit Generators
 * http://github.com/colinbdclark/flocking
 *
 * Copyright 2013-2015, Colin Clark
 * Dual licensed under the MIT and GPL Version 2 licenses.
 */

/*global require*/
/*jshint white: false, newcap: true, regexp: true, browser: true,
    forin: false, nomen: true, bitwise: false, maxerr: 100,
    indent: 4, plusplus: false, curly: true, eqeqeq: true,
    freeze: true, latedef: true, noarg: true, nonew: true, quotmark: double, undef: true,
    unused: true, strict: true, asi: false, boss: false, evil: false, expr: false,
    funcscope: false*/

var fluid = fluid || require("infusion"),
    flock = fluid.registerNamespace("flock");

(function () {
    "use strict";

    /**
     * Changes from the <code>initial</code> input to the <code>target</code> input
     * at the specified <code>time</code>. An optional <code>crossfade</code> duration
     * may be specified to linearly crossfade between the two inputs.
     *
     * Can be used to schedule sample-accurate changes.
     * Note that the <code>target</code> input will be evaluated from the beginning,
     * even if its value isn't yet output.
     *
     */
    flock.ugen.change = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                initial = that.inputs.initial.output,
                initialInc = m.strides.initial,
                target = that.inputs.target.output,
                targetInc = m.strides.target,
                out = that.output,
                samplesLeft = m.samplesLeft,
                crossfadeLevel = m.crossfadeLevel,
                val;

            for (var i = 0, j = 0, k = 0; i < numSamps; i++, j += initialInc, k += targetInc) {
                if (samplesLeft > 0) {
                    // We haven't hit the scheduled time yet.
                    val = initial[j];
                    samplesLeft--;
                } else if (crossfadeLevel > 0.0) {
                    // We've hit the scheduled time, but we still need to peform the crossfade.
                    val = (initial[j] * crossfadeLevel) + (target[k] * (1.0 - crossfadeLevel));
                    crossfadeLevel -= m.crossfadeStepSize;
                } else {
                    // We're done.
                    val = target[k];
                }

                out[i] = val;
            }

            m.samplesLeft = samplesLeft;
            m.crossfadeLevel = crossfadeLevel;
            m.value = m.unscaledValue = val;
        };

        that.onInputChanged = function (inputName) {
            var m = that.model,
                inputs = that.inputs;

            if (inputName === "time" || !inputName) {
                m.samplesLeft = Math.round(inputs.time.output[0] * m.sampleRate);
            }

            if (inputName === "crossfade" || !inputName) {
                m.crossfadeStepSize = 1.0 / Math.round(inputs.crossfade.output[0] * m.sampleRate);
                m.crossfadeLevel = inputs.crossfade.output[0] > 0.0 ? 1.0 : 0.0;
            }

            that.calculateStrides();
        };

        that.onInputChanged();

        return that;
    };

    fluid.defaults("flock.ugen.change", {
        rate: "audio",

        inputs: {
            /**
             * An input unit generator to output initially.
             * Can be audio, control, or constant rate.
             */
            initial: 0.0,

            /**
             * The unit generator to output after the specified time.
             * Can be audio, control, or constant rate.
             */
            target: 0.0,

            /**
             * The sample-accurate time (in seconds) at which the
             * the change should occur.
             */
            time: 0.0,

            /**
             * The duration of the optional linear crossfade between
             * the two values.
             */
            crossfade: 0.0
        },

        ugenOptions: {
            model: {
                samplesLeft: 0.0,
                crossfadeStepSize: 0,
                crossfadeLevel: 0.0,
                unscaledValue: 0.0,
                value: 0.0
            },
            strideInputs: ["initial", "target"]
        }
    });

    flock.ugen.sequence = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var values = that.inputs.values,
                inputs = that.inputs,
                freq = inputs.freq.output,
                loop = inputs.loop.output[0],
                m = that.model,
                scale = m.scale,
                out = that.output,
                start = inputs.start ? Math.round(inputs.start.output[0]) : 0,
                end = inputs.end ? Math.round(inputs.end.output[0]) : values.length,
                startItem,
                i,
                j;

            if (m.unscaledValue === undefined) {
                startItem = values[start];
                m.unscaledValue = (startItem === undefined) ? 0.0 : startItem;
            }

            if (m.nextIdx === undefined) {
                m.nextIdx = start;
            }

            for (i = 0, j = 0; i < numSamps; i++, j += m.strides.freq) {
                if (m.nextIdx >= end) {
                    if (loop > 0.0) {
                        m.nextIdx = start;
                    } else {
                        out[i] = m.unscaledValue;
                        continue;
                    }
                }

                out[i] = m.unscaledValue = values[m.nextIdx];
                m.phase += freq[j] * scale;

                if (m.phase >= 1.0) {
                    m.phase = 0.0;
                    m.nextIdx++;
                }
            }

            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged = function () {
            that.model.scale = that.rate !== flock.rates.DEMAND ? that.model.sampleDur : 1;

            if ((!that.inputs.values || that.inputs.values.length === 0) && that.inputs.list) {
                flock.log.warn("The 'list' input to flock.ugen.sequence is deprecated. Use 'values' instead.");
                that.inputs.values = that.inputs.list;
            }

            if (!that.inputs.values) {
                that.inputs.values = [];
            }

            that.calculateStrides();
            flock.onMulAddInputChanged(that);
        };

        that.init = function () {
            that.onInputChanged();
        };

        that.init();
        return that;
    };

    fluid.defaults("flock.ugen.sequence", {
        rate: "control",

        inputs: {
            start: 0,
            freq: 1.0,
            loop: 0.0,
            values: []
        },

        ugenOptions: {
            model: {
                unscaledValue: undefined,
                value: 0.0,
                phase: 0
            },

            strideInputs: ["freq"]
        }
    });


    /**
     * A Sequencer unit generator outputs a sequence of values
     * for the specified sequence of durations.
     *
     * Optionally, when the resetOnNext flag is set,
     * the sequencer will reset its value to 0.0 for one sample
     * prior to moving to the next duration.
     * This is useful for sequencing envelope gates, for example.
     *
     * Inputs:
     *     durations: an array of durations (in seconds) to hold each value
     *     values: an array of values to output
     *     loop: if > 0, the unit generator will loop back to the beginning
     *         of the lists when it reaches the end; defaults to 0.
     */
    // TODO: Unit Tests!
    flock.ugen.sequencer = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                o = that.options,
                resetOnNext = o.resetOnNext,
                out = that.output,
                loop = that.inputs.loop.output[0],
                durations = that.inputs.durations,
                values = that.inputs.values,
                i,
                val;

            for (i = 0; i < numSamps; i++) {
                if (values.length === 0 || durations.length === 0) {
                    // Nothing to output.
                    out[i] = val = 0.0;
                    continue;
                }

                if (m.samplesRemaining <= 0) {
                    // We've hit the end of a stage.
                    if (m.idx < durations.length - 1) {
                        // Continue to the next value/duration pair.
                        m.idx++;
                        val = flock.ugen.sequencer.nextStage(durations, values, resetOnNext, m);
                    } else if (loop > 0.0) {
                        // Loop back to the first value/duration pair.
                        m.idx = 0;
                        val = flock.ugen.sequencer.nextStage(durations, values, resetOnNext, m);
                    } else {
                        // Nothing left to do.
                        val = o.holdLastValue ? m.unscaledValue : 0.0;
                    }
                } else {
                    // Still in the midst of a stage.
                    val = values[m.idx];
                    m.samplesRemaining--;
                }

                out[i] = val;
            }

            m.unscaledValue = val;
            that.mulAdd(numSamps);
            m.value = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged = function (inputName) {
            var inputs = that.inputs;

            if (!inputName || inputName === "durations") {
                flock.ugen.sequencer.calcDurationsSamps(inputs.durations, that.model);
                flock.ugen.sequencer.failOnMissingInput("durations", that);
            }

            if (!inputName || inputName === "values") {
                flock.ugen.sequencer.failOnMissingInput("values", that);
            }

            if (inputs.durations.length !== inputs.values.length) {
                flock.fail("Mismatched durations and values array lengths for flock.ugen.sequencer: " +
                    fluid.prettyPrintJSON(that.options.ugenDef));
            }

            flock.onMulAddInputChanged(that);
        };

        that.init = function () {
            that.onInputChanged();
        };

        that.init();
        return that;
    };

    flock.ugen.sequencer.failOnMissingInput = function (inputName, that) {
        var input = that.inputs[inputName];
        if (!input || !flock.isIterable(input)) {
            flock.fail("No " + inputName + " array input was specified for flock.ugen.sequencer: " +
                fluid.prettyPrintJSON(that.options.ugenDef));
        }
    };

    flock.ugen.sequencer.calcDurationsSamps = function (durations, m) {
        m.samplesRemaining = Math.floor(durations[m.idx] * m.sampleRate);
    };

    flock.ugen.sequencer.nextStage = function (durations, values, resetOnNext, m) {
        flock.ugen.sequencer.calcDurationsSamps(durations, m);
        m.samplesRemaining--;
        return resetOnNext ? 0.0 : values[m.idx];
    };

    fluid.defaults("flock.ugen.sequencer", {
        rate: "audio",
        inputs: {
            // TODO: start,
            // TODO: end,
            // TODO: skip
            // TODO: direction,
            durations: [],
            values: [],
            loop: 0.0
        },
        ugenOptions: {
            model: {
                idx: 0,
                samplesRemaining: 0,
                unscaledValue: 0.0,
                value: 0.0
            },
            resetOnNext: false,
            holdLastvalue: false
        }
    });

}());
;/*
 * Flocking Trigger Unit Generators
 * http://github.com/colinbdclark/flocking
 *
 * Copyright 2011-2015, Colin Clark
 * Dual licensed under the MIT and GPL Version 2 licenses.
 */

/*global require*/
/*jshint white: false, newcap: true, regexp: true, browser: true,
    forin: false, nomen: true, bitwise: false, maxerr: 100,
    indent: 4, plusplus: false, curly: true, eqeqeq: true,
    freeze: true, latedef: true, noarg: true, nonew: true, quotmark: double, undef: true,
    unused: true, strict: true, asi: false, boss: false, evil: false, expr: false,
    funcscope: false*/

var fluid = fluid || require("infusion"),
    flock = fluid.registerNamespace("flock");

(function () {
    "use strict";

    flock.ugen.valueChangeTrigger = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                source = that.inputs.source.output,
                out = that.output,
                i,
                j,
                val;

            for (i = 0, j = 0; i < numSamps; i++, j += m.strides.source) {
                val = source[j];
                out[i] = val !== m.prevVal ? 1.0 : 0.0;
                m.prevVal = val;
            }

            m.value = m.unscaledValue = val;
        };

        that.onInputChanged = function (inputName) {
            that.calculateStrides();

            if (inputName === "source") {
                // Force a trigger to be output whenever the input is changed,
                // even if it's the same value as was previously held.
                that.model.prevVal = null;
            }
        };

        that.calculateStrides();
        return that;
    };

    fluid.defaults("flock.ugen.valueChangeTrigger", {
        rate: "control",

        inputs: {
            source: 0.0
        },
        ugenOptions: {
            model: {
                unscaledValue: 0.0,
                value: 0.0,
                prevVal: 0.0
            },

            strideInputs: ["source"]
        }
    });


    flock.ugen.inputChangeTrigger = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                source = that.inputs.source.output,
                sourceInc = m.strides.source,
                duration = that.inputs.duration.output,
                durationInc = m.strides.duration,
                prevDur = m.prevDur,
                out = that.output,
                i,
                j,
                k,
                val,
                dur;

            for (i = j = k = 0; i < numSamps; i++, j += sourceInc, k += durationInc) {
                val = source[j];
                dur = duration[k];

                if (dur !== prevDur) {
                    m.prevDur = dur;
                    m.remainingOpenSamples = val > 0 ? (dur > 0 ? m.sampleRate * dur : 1) : 0;
                }

                if (m.remainingOpenSamples > 0) {
                    out[i] = val;
                    m.remainingOpenSamples--;
                } else {
                    out[i] = 0.0;
                }
            }

            m.value = m.unscaledValue = flock.ugen.lastOutputValue(numSamps, out);
        };

        that.onInputChanged = function (inputName) {
            that.calculateStrides();

            if (inputName === "source") {
                that.model.prevDur = null;
            }
        };

        that.calculateStrides();
        return that;
    };

    fluid.defaults("flock.ugen.inputChangeTrigger", {
        rate: "control",

        inputs: {
            source: 0,
            duration: 0
        },

        ugenOptions: {
            model: {
                unscaledValue: 0.0,
                value: 0.0,
                prevDuration: 0,
                remainingOpenSamples: 0
            },

            strideInputs: ["source", "duration"]
        }
    });


    flock.ugen.triggerCallback = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function (numSamps) {
            var m = that.model,
                o = that.options,
                out = that.output,
                inputs = that.inputs,
                triggerInc = m.strides.trigger,
                sourceInc = m.strides.source,
                trig = inputs.trigger.output,
                source = inputs.source.output,
                cbSpec = o.callback,
                fn = cbSpec.func,
                args = cbSpec.args,
                cbThis = cbSpec.this,
                lastArgIdx = m.lastArgIdx,
                prevTrig = m.prevTrig,
                i,
                j,
                k,
                currTrig,
                sourceVal;

            for (i = j = k = 0; i < numSamps; i++, j += triggerInc, k += sourceInc) {
                currTrig = trig[j];
                sourceVal = source[k];

                if (currTrig > 0.0 && prevTrig <= 0.0 && fn) {
                    // Insert the current source value into the arguments list
                    // and then invoke the specified callback function.
                    args[lastArgIdx] = sourceVal;
                    fn.apply(cbThis, args);
                }

                out[i] = sourceVal;
                prevTrig = currTrig;
            }

            m.prevTrig = prevTrig;
            m.value = m.unscaledValue = sourceVal;
        };

        that.onInputChanged = function () {
            var o = that.options,
                m = that.model,
                cbSpec = o.callback,
                funcName = cbSpec.funcName;

            if (funcName) {
                cbSpec.func = fluid.getGlobalValue(funcName);
            } else if (cbSpec.this && cbSpec.method) {
                if (typeof cbSpec.this !== "string") {
                    throw new Error("flock.ugen.triggerCallback doesn't support raw 'this' objects." +
                        "Use a global key path instead.");
                }
                cbSpec.this = typeof cbSpec.this === "string" ?
                    fluid.getGlobalValue(cbSpec.this) : cbSpec.this;
                cbSpec.func = fluid.get(cbSpec.this, cbSpec.method);
            }

            m.lastArgIdx = cbSpec.args.length;
            that.calculateStrides();
        };

        that.onInputChanged();
        return that;
    };

    fluid.defaults("flock.ugen.triggerCallback", {
        rate: "audio",
        inputs: {
            source: 0,
            trigger: 0
        },
        ugenOptions: {
            model: {
                unscaledValue: 0.0,
                value: 0.0,
                funcName: undefined,
                lastArgIdx: 0
            },
            callback: {
                "this": undefined,
                method: undefined,
                func: undefined,
                args: []
            },
            strideInputs: ["source", "trigger"]
        }
    });
    flock.ugen.t2a = function (inputs, output, options) {
        var that = flock.ugen(inputs, output, options);

        that.gen = function () {
            var m = that.model,
                trig = that.inputs.source.output[0],
                offset = that.inputs.offset.output[0] | 0,
                out = that.output,
                val;

            // Clear the output buffer.
            for (var i = 0; i < out.length; i++) {
                out[i] = val = 0.0;
            }

            // Write the trigger value to the audio stream if it's open.
            if (trig > 0.0 && m.prevTrig <= 0.0) {
                out[offset] = val = trig;
            }

            m.prevTrig = trig;
            m.value = m.unscaledValue = val;
        };

        return that;
    };

    fluid.defaults("flock.ugen.t2a", {
        rate: "audio",
        inputs: {
            source: null,
            offset: 0
        },
        ugenOptions: {
            model: {
                prevTrig: 0.0,
                unscaledValue: 0.0,
                value: 0.0
            }
        }
    });

}());