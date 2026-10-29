# Phase 0 probe 2 — READ ONLY. Current value and key class of every numeric ColourAdjust field.
#
# Answers: Q2 (current/default values), Q4 (source.isExplicitEffectMode value), key class.
# Only touches float/uint/ubyte sequences: those hold KeyFloat keys, whose .v and .localT are
# documented safe (patterns/timeline-export-keyframe-access.md). Resource sequences (mapping,
# source.texture) are skipped entirely — never call key() on a possible KeyAsKeyContainer.
# Names checked in d3.pyi: Track.getLeafLayers(type), Layer.nSequences/sequence(i),
# FieldSequence.name/typeName/defaultValue/sequence, KeySequence.nKeys/key(i), Key.v/localT.
#
# Run: npm run cli -- exec --file C:/dev/disguise-color-grader/probes/probe_colouradjust_values.py

import json
import d3

NUMERIC = ('float', 'uint', 'ubyte', 'int')
out = {'ok': True, 'layers': []}
try:
    leaf = guisystem.track.getLeafLayers(d3.ColourAdjustModule)
    for i in range(len(leaf)):
        L = leaf[i]
        info = {'name': str(L.name), 'fields': {}}
        for j in range(L.nSequences()):
            fs = L.sequence(j)
            tn = str(fs.typeName)
            if tn not in NUMERIC:
                continue
            f = {'type': tn}
            try:
                ks = fs.sequence
                k0 = ks.key(0)
                f['keyClass'] = str(type(k0).__name__)
                if f['keyClass'] == 'KeyFloat':
                    f['v'] = float(k0.v)
                    f['t'] = float(k0.localT)
            except:
                f['error'] = 'read failed'
            try:
                f['default'] = str(fs.defaultValue)
            except:
                pass
            info['fields'][str(fs.name)] = f
        out['layers'].append(info)
except:
    out['ok'] = False
    import traceback
    out['trace'] = traceback.format_exc()

return json.dumps(out)
