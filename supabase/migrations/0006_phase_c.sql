-- =============================================================================
-- Phase C — seed a `field_draw` type (Grand National) into the catalogue.
--
-- The field_draw ENGINE lives in code (src/core/engines/field_draw.ts) and is
-- fully unit-tested. This migration only adds catalogue DATA. The type is seeded
-- INACTIVE: it shows in the super-admin catalogue but is NOT offered in the
-- organiser create picker (listSweepstakeTypes filters active=true), so no
-- unplayable sweepstake can be created until the field_draw /app screens ship.
-- Flip `active = true` then.
--
-- The field below is a PROVISIONAL placeholder — Grand National runners change
-- every year. Replace it via SQL (update sweepstake_type set data = …) before
-- running a real event.
-- =============================================================================
insert into sweepstake_type (name, sport, engine, data, default_prizes, active) values (
  'Grand National', 'Horse racing', 'field_draw',
  $json${
    "field": [
      "Galloping Glory","Emerald Dasher","Midnight Verdict","Clover Comet","Brackenmoor",
      "Silver Tempest","Ironhoof","Whistling Gale","Copperfield Lad","Thunder Reel",
      "Marble Arch","Ballyroan Boy","Saffron Sprint","Drumlin Dancer","Northern Quill",
      "Velvet Mariner","Granite Runner","Foxglove Flyer","Tidewater","Highland Echo",
      "Cobalt Crusader","Riverbank Rover","Amberline","Storm Petrel","Cinnamon Rush",
      "Larkspur Lane","Oakhaven","Quicksilver Jack","Meadowgale","Pendle Mist",
      "Sable Knight","Harbour Light","Bramble Bay","Crimson Tally","Westwind Warrior",
      "Hazelwood","Solway Spirit","Dappled Dawn","Beacon Hill","Tinkertown Lad"
    ]
  }$json$::jsonb,
  $json${"placePrizes":[{"mode":"£","value":40},{"mode":"£","value":20},{"mode":"£","value":10}]}$json$::jsonb,
  false
);
