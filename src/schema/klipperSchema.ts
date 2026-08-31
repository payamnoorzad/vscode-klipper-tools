/**
 * Comprehensive schema definition for Klipper configuration files.
 * Contains metadata for sections, parameters, data types, descriptions, and defaults.
 */

export type OptionType = 'pin' | 'float' | 'int' | 'boolean' | 'string' | 'choice' | 'gcode';

export interface KlipperOption {
  name: string;
  type: OptionType;
  description: string;
  default?: string | number | boolean;
  required?: boolean;
  choices?: string[];
  snippet?: string;
}

export interface KlipperSection {
  name: string;
  description: string;
  allowsName?: boolean;
  namePrompt?: string;
  options: Record<string, KlipperOption>;
}

export const KLIPPER_SCHEMA: Record<string, KlipperSection> = {
  printer: {
    name: 'printer',
    description: 'The `[printer]` section contains primary settings for printer kinematics and motion speeds.',
    allowsName: false,
    options: {
      kinematics: {
        name: 'kinematics',
        type: 'choice',
        description: 'The type of printer kinematics.',
        choices: ['cartesian', 'corexy', 'corexz', 'delta', 'rotary_delta', 'polar', 'winch', 'none'],
        required: true,
      },
      max_velocity: {
        name: 'max_velocity',
        type: 'float',
        description: 'Maximum velocity (in mm/s) of the toolhead in normal movements.',
        required: true,
      },
      max_accel: {
        name: 'max_accel',
        type: 'float',
        description: 'Maximum acceleration (in mm/s^2) of the toolhead.',
        required: true,
      },
      max_accel_to_decel: {
        name: 'max_accel_to_decel',
        type: 'float',
        description: 'A pseudo acceleration that governs how fast deceleration starts. Default is half of max_accel.',
      },
      minimum_cruise_ratio: {
        name: 'minimum_cruise_ratio',
        type: 'float',
        description: 'Alternative to max_accel_to_decel in modern Klipper (e.g. 0.5 for 50% cruise velocity).',
        default: 0.5,
      },
      square_corner_velocity: {
        name: 'square_corner_velocity',
        type: 'float',
        description: 'The maximum velocity (in mm/s) that the toolhead may travel a 90 degree corner at.',
        default: 5.0,
      },
      max_z_velocity: {
        name: 'max_z_velocity',
        type: 'float',
        description: 'Maximum velocity (in mm/s) for movements along the Z axis.',
      },
      max_z_accel: {
        name: 'max_z_accel',
        type: 'float',
        description: 'Maximum acceleration (in mm/s^2) for movements along the Z axis.',
      },
    },
  },

  mcu: {
    name: 'mcu',
    description: 'Microcontroller connection settings (serial, baud, canbus_uuid).',
    allowsName: true,
    namePrompt: 'mcu_name',
    options: {
      serial: {
        name: 'serial',
        type: 'string',
        description: 'The serial port device path (e.g. `/dev/serial/by-id/...` or `/dev/ttyACM0`).',
      },
      canbus_uuid: {
        name: 'canbus_uuid',
        type: 'string',
        description: 'The CAN bus unique identifier for CAN-connected MCUs.',
      },
      baud: {
        name: 'baud',
        type: 'int',
        description: 'The baud rate to communicate at with the serial port.',
        default: 250000,
      },
      restart_method: {
        name: 'restart_method',
        type: 'choice',
        choices: ['arduino', 'cheetah', 'rpi_usb', 'command'],
        description: 'Microcontroller reset method.',
      },
    },
  },

  stepper_x: {
    name: 'stepper_x',
    description: 'X axis stepper motor definition and endstop parameters.',
    allowsName: false,
    options: {
      step_pin: {
        name: 'step_pin',
        type: 'pin',
        description: 'MCU GPIO pin connected to the STEP pin of the driver.',
        required: true,
      },
      dir_pin: {
        name: 'dir_pin',
        type: 'pin',
        description: 'MCU GPIO pin connected to the DIR pin. Invert with ! prefix.',
        required: true,
      },
      enable_pin: {
        name: 'enable_pin',
        type: 'pin',
        description: 'MCU GPIO pin connected to the ENABLE pin. Invert with ! prefix.',
        required: true,
      },
      microsteps: {
        name: 'microsteps',
        type: 'int',
        description: 'Microsteps per full step configured for the driver (e.g. 16, 32, 64).',
        required: true,
      },
      rotation_distance: {
        name: 'rotation_distance',
        type: 'float',
        description: 'The distance (in mm) the axis travels for one full rotation of the stepper motor.',
        required: true,
      },
      full_steps_per_rotation: {
        name: 'full_steps_per_rotation',
        type: 'int',
        description: 'Number of full steps per motor rotation (200 for 1.8° or 400 for 0.9° steppers).',
        default: 200,
      },
      gear_ratio: {
        name: 'gear_ratio',
        type: 'string',
        description: 'Gear ratio if the stepper uses a pulley/geared drive (e.g. 50:10).',
      },
      endstop_pin: {
        name: 'endstop_pin',
        type: 'pin',
        description: 'MCU GPIO pin connected to the endstop switch or sensorless virtual pin (e.g. tmc2209_stepper_x:virtual_endstop).',
        required: true,
      },
      position_min: {
        name: 'position_min',
        type: 'float',
        description: 'Minimum valid axis coordinate (in mm).',
        default: 0.0,
      },
      position_endstop: {
        name: 'position_endstop',
        type: 'float',
        description: 'The location (in mm) of the axis when endstop triggers.',
        required: true,
      },
      position_max: {
        name: 'position_max',
        type: 'float',
        description: 'Maximum valid axis coordinate (in mm).',
        required: true,
      },
      homing_speed: {
        name: 'homing_speed',
        type: 'float',
        description: 'Speed (in mm/s) for initial homing move.',
        default: 5.0,
      },
      homing_retract_dist: {
        name: 'homing_retract_dist',
        type: 'float',
        description: 'Distance (in mm) to back off from the endstop after initial trigger.',
        default: 5.0,
      },
      homing_positive_dir: {
        name: 'homing_positive_dir',
        type: 'boolean',
        description: 'True if homing moves towards positive coordinates.',
      },
    },
  },

  stepper_y: {
    name: 'stepper_y',
    description: 'Y axis stepper motor definition and endstop parameters.',
    allowsName: false,
    options: {
      step_pin: { name: 'step_pin', type: 'pin', description: 'STEP pin.', required: true },
      dir_pin: { name: 'dir_pin', type: 'pin', description: 'DIR pin.', required: true },
      enable_pin: { name: 'enable_pin', type: 'pin', description: 'ENABLE pin.', required: true },
      microsteps: { name: 'microsteps', type: 'int', description: 'Microsteps per full step.', required: true },
      rotation_distance: { name: 'rotation_distance', type: 'float', description: 'Distance (in mm) traveled per full motor rotation.', required: true },
      full_steps_per_rotation: { name: 'full_steps_per_rotation', type: 'int', description: 'Full steps per rotation (200 or 400).', default: 200 },
      gear_ratio: { name: 'gear_ratio', type: 'string', description: 'Gear ratio (e.g. 50:10).' },
      endstop_pin: { name: 'endstop_pin', type: 'pin', description: 'Endstop switch pin.', required: true },
      position_min: { name: 'position_min', type: 'float', description: 'Minimum valid axis position.' },
      position_endstop: { name: 'position_endstop', type: 'float', description: 'Position when endstop is hit.', required: true },
      position_max: { name: 'position_max', type: 'float', description: 'Maximum valid axis position.', required: true },
      homing_speed: { name: 'homing_speed', type: 'float', description: 'Homing speed (mm/s).' },
      homing_retract_dist: { name: 'homing_retract_dist', type: 'float', description: 'Retract distance after first bump.' },
      homing_positive_dir: { name: 'homing_positive_dir', type: 'boolean', description: 'True if homing in positive direction.' },
    },
  },

  stepper_z: {
    name: 'stepper_z',
    description: 'Z axis stepper motor definition and endstop/probe parameters.',
    allowsName: false,
    options: {
      step_pin: { name: 'step_pin', type: 'pin', description: 'STEP pin.', required: true },
      dir_pin: { name: 'dir_pin', type: 'pin', description: 'DIR pin.', required: true },
      enable_pin: { name: 'enable_pin', type: 'pin', description: 'ENABLE pin.', required: true },
      microsteps: { name: 'microsteps', type: 'int', description: 'Microsteps.', required: true },
      rotation_distance: { name: 'rotation_distance', type: 'float', description: 'Rotation distance (mm). For leadscrews: pitch * starts.', required: true },
      gear_ratio: { name: 'gear_ratio', type: 'string', description: 'Gear ratio (e.g. 80:16 for Voron 2.4 Z belts).' },
      endstop_pin: { name: 'endstop_pin', type: 'pin', description: 'Endstop pin or probe:z_virtual_endstop.', required: true },
      position_min: { name: 'position_min', type: 'float', description: 'Minimum position (can be negative for probe offset).' },
      position_endstop: { name: 'position_endstop', type: 'float', description: 'Position at endstop trigger.' },
      position_max: { name: 'position_max', type: 'float', description: 'Maximum Z height.', required: true },
      homing_speed: { name: 'homing_speed', type: 'float', description: 'Z homing speed (mm/s).' },
      second_homing_speed: { name: 'second_homing_speed', type: 'float', description: 'Second homing move speed for accurate probing.' },
      homing_retract_dist: { name: 'homing_retract_dist', type: 'float', description: 'Retract distance between probes.' },
    },
  },

  extruder: {
    name: 'extruder',
    description: 'Extruder stepper, hotend heater, and thermistor sensor settings.',
    allowsName: true,
    options: {
      step_pin: { name: 'step_pin', type: 'pin', description: 'Extruder STEP pin.', required: true },
      dir_pin: { name: 'dir_pin', type: 'pin', description: 'Extruder DIR pin.', required: true },
      enable_pin: { name: 'enable_pin', type: 'pin', description: 'Extruder ENABLE pin.', required: true },
      microsteps: { name: 'microsteps', type: 'int', description: 'Microsteps.', required: true },
      rotation_distance: { name: 'rotation_distance', type: 'float', description: 'Extruder rotation distance (mm of filament extruded per full motor rotation).', required: true },
      gear_ratio: { name: 'gear_ratio', type: 'string', description: 'Extruder gearbox ratio (e.g. 50:10 for CW2, 50:8 for Stealthburner).' },
      nozzle_diameter: { name: 'nozzle_diameter', type: 'float', description: 'Nozzle orifice diameter (e.g. 0.400).', required: true },
      filament_diameter: { name: 'filament_diameter', type: 'float', description: 'Filament raw diameter (typically 1.750).', required: true },
      heater_pin: { name: 'heater_pin', type: 'pin', description: 'MOSFET/PWM pin powering the hotend heater cartridge.', required: true },
      sensor_type: {
        name: 'sensor_type',
        type: 'choice',
        description: 'Thermistor or thermocouple sensor type (e.g. EPCOS 100K B57560G104F, PT1000, ATC Semitec 104NT-4-R025H42G).',
        choices: [
          'EPCOS 100K B57560G104F',
          'ATC Semitec 104GT-2',
          'ATC Semitec 104NT-4-R025H42G',
          'Generic 3950',
          'PT1000',
          'MAX31865',
          'MAX6675',
          'NTC 100K MGB18-104F39050L32',
          'SliceEngineering 450'
        ],
        required: true,
      },
      sensor_pin: { name: 'sensor_pin', type: 'pin', description: 'ADC pin connected to thermistor.', required: true },
      control: { name: 'control', type: 'choice', choices: ['pid', 'watermark'], description: 'Heater temperature control algorithm.', required: true },
      pid_Kp: { name: 'pid_Kp', type: 'float', description: 'Proportional PID parameter.' },
      pid_Ki: { name: 'pid_Ki', type: 'float', description: 'Integral PID parameter.' },
      pid_Kd: { name: 'pid_Kd', type: 'float', description: 'Derivative PID parameter.' },
      min_temp: { name: 'min_temp', type: 'float', description: 'Minimum allowed safe temperature (°C).', required: true },
      max_temp: { name: 'max_temp', type: 'float', description: 'Maximum allowed safe temperature (°C).', required: true },
      min_extrude_temp: { name: 'min_extrude_temp', type: 'float', description: 'Minimum temperature required to allow extrusion.', default: 170.0 },
      max_extrude_only_distance: { name: 'max_extrude_only_distance', type: 'float', description: 'Max filament length allowed in a single extrude-only command.', default: 50.0 },
      max_extrude_cross_section: { name: 'max_extrude_cross_section', type: 'float', description: 'Max allowed volumetric cross section.' },
      pressure_advance: { name: 'pressure_advance', type: 'float', description: 'Pressure advance compensation amount (seconds).', default: 0.0 },
      pressure_advance_smooth_time: { name: 'pressure_advance_smooth_time', type: 'float', description: 'Time range (seconds) over which pressure advance applies.', default: 0.04 },
    },
  },

  heater_bed: {
    name: 'heater_bed',
    description: 'Heated print bed configuration and thermistor settings.',
    allowsName: false,
    options: {
      heater_pin: { name: 'heater_pin', type: 'pin', description: 'MOSFET/SSR pin powering the bed.', required: true },
      sensor_type: { name: 'sensor_type', type: 'string', description: 'Bed thermistor sensor type.', required: true },
      sensor_pin: { name: 'sensor_pin', type: 'pin', description: 'ADC pin for bed thermistor.', required: true },
      control: { name: 'control', type: 'choice', choices: ['pid', 'watermark'], description: 'Bed control algorithm.', required: true },
      pid_Kp: { name: 'pid_Kp', type: 'float', description: 'Bed PID Kp.' },
      pid_Ki: { name: 'pid_Ki', type: 'float', description: 'Bed PID Ki.' },
      pid_Kd: { name: 'pid_Kd', type: 'float', description: 'Bed PID Kd.' },
      min_temp: { name: 'min_temp', type: 'float', description: 'Minimum safe bed temp (°C).', required: true },
      max_temp: { name: 'max_temp', type: 'float', description: 'Maximum safe bed temp (°C).', required: true },
      max_power: { name: 'max_power', type: 'float', description: 'Maximum PWM duty cycle (0.0 to 1.0).', default: 1.0 },
    },
  },

  fan: {
    name: 'fan',
    description: 'Part cooling fan (controlled by M106/M107 G-code commands).',
    allowsName: false,
    options: {
      pin: { name: 'pin', type: 'pin', description: 'PWM pin connected to the part fan.', required: true },
      max_power: { name: 'max_power', type: 'float', description: 'Max PWM duty cycle (0.0 - 1.0).', default: 1.0 },
      shutdown_speed: { name: 'shutdown_speed', type: 'float', description: 'Fan speed on MCU error.', default: 0 },
      cycle_time: { name: 'cycle_time', type: 'float', description: 'PWM cycle time in seconds.', default: 0.010 },
      hardware_pwm: { name: 'hardware_pwm', type: 'boolean', description: 'Enable hardware PWM if pin supports it.' },
      kick_start_time: { name: 'kick_start_time', type: 'float', description: 'Time (in seconds) to run fan at full speed when starting.', default: 0.1 },
      off_below: { name: 'off_below', type: 'float', description: 'Threshold below which fan is turned completely off.', default: 0.0 },
    },
  },

  heater_fan: {
    name: 'heater_fan',
    description: 'Hotend or electronics cooling fan that turns on automatically when a heater reaches a threshold temperature.',
    allowsName: true,
    namePrompt: 'fan_name',
    options: {
      pin: { name: 'pin', type: 'pin', description: 'PWM pin for heater fan.', required: true },
      max_power: { name: 'max_power', type: 'float', description: 'Max PWM duty cycle.', default: 1.0 },
      heater: { name: 'heater', type: 'string', description: 'Name of the heater section to monitor (e.g. extruder, heater_bed).', default: 'extruder' },
      heater_temp: { name: 'heater_temp', type: 'float', description: 'Temperature (°C) above which the fan turns on automatically.', default: 50.0 },
      fan_speed: { name: 'fan_speed', type: 'float', description: 'Fan speed (0.0 - 1.0) when heater is active.', default: 1.0 },
    },
  },

  probe: {
    name: 'probe',
    description: 'Z probe configuration (inductive, tap, klicky, etc.).',
    allowsName: false,
    options: {
      pin: { name: 'pin', type: 'pin', description: 'Sensor input pin for probe.', required: true },
      x_offset: { name: 'x_offset', type: 'float', description: 'Distance (mm) between probe and nozzle along X.', default: 0.0 },
      y_offset: { name: 'y_offset', type: 'float', description: 'Distance (mm) between probe and nozzle along Y.', default: 0.0 },
      z_offset: { name: 'z_offset', type: 'float', description: 'Distance (mm) between probe trigger point and nozzle along Z.', required: true },
      speed: { name: 'speed', type: 'float', description: 'Probing speed along Z (mm/s).', default: 5.0 },
      samples: { name: 'samples', type: 'int', description: 'Number of times to probe each point.', default: 1 },
      sample_retract_dist: { name: 'sample_retract_dist', type: 'float', description: 'Retract distance between probe samples (mm).', default: 2.0 },
      samples_result: { name: 'samples_result', type: 'choice', choices: ['median', 'average'], description: 'How to calculate final probe value from samples.', default: 'average' },
      samples_tolerance: { name: 'samples_tolerance', type: 'float', description: 'Maximum allowed deviation between samples (mm).' },
      samples_tolerance_retries: { name: 'samples_tolerance_retries', type: 'int', description: 'Number of retries if tolerance is exceeded.', default: 0 },
      activate_gcode: { name: 'activate_gcode', type: 'gcode', description: 'G-code commands executed before each probe attempt.' },
      deactivate_gcode: { name: 'deactivate_gcode', type: 'gcode', description: 'G-code commands executed after probing completes.' },
    },
  },

  bed_mesh: {
    name: 'bed_mesh',
    description: 'Bed mesh leveling and surface distortion compensation.',
    allowsName: false,
    options: {
      speed: { name: 'speed', type: 'float', description: 'Travel speed (mm/s) between mesh points.', default: 50.0 },
      horizontal_move_z: { name: 'horizontal_move_z', type: 'float', description: 'Z clearance height (mm) while moving between probe points.', default: 5.0 },
      mesh_min: { name: 'mesh_min', type: 'string', description: 'Minimum X,Y coordinates of the probed area (e.g. 20, 20).', required: true },
      mesh_max: { name: 'mesh_max', type: 'string', description: 'Maximum X,Y coordinates of the probed area (e.g. 280, 280).', required: true },
      probe_count: { name: 'probe_count', type: 'string', description: 'Number of probe points along each axis (e.g. 5, 5 or 7, 7).', default: '3, 3' },
      mesh_pps: { name: 'mesh_pps', type: 'string', description: 'The number of points per segment to interpolate in the mesh (e.g. 2, 2).', default: '2, 2' },
      algorithm: { name: 'algorithm', type: 'choice', choices: ['lagrange', 'bicubic'], description: 'Interpolation algorithm for the bed mesh.', default: 'bicubic' },
      bicubic_tension: { name: 'bicubic_tension', type: 'float', description: 'Tension coefficient when algorithm is bicubic.', default: 0.2 },
      fade_start: { name: 'fade_start', type: 'float', description: 'Z height at which mesh compensation fade begins (mm).', default: 1.0 },
      fade_end: { name: 'fade_end', type: 'float', description: 'Z height at which mesh compensation is fully faded (mm).', default: 10.0 },
      fade_target: { name: 'fade_target', type: 'float', description: 'The Z position in which fade should converge.' },
      split_delta_z: { name: 'split_delta_z', type: 'float', description: 'The amount of Z difference along a move that warrants splitting it.', default: 0.025 },
      move_check_distance: { name: 'move_check_distance', type: 'float', description: 'Distance to check for split moves.', default: 5.0 },
      zero_reference_position: { name: 'zero_reference_position', type: 'string', description: 'X,Y coordinate to use as the 0.0 Z reference point (modern replacement for relative_reference_index).' },
      relative_reference_index: { name: 'relative_reference_index', type: 'int', description: 'Probe point index used as the 0.0 Z reference (deprecated).' },
    },
  },

  tmc5160: {
    name: 'tmc5160',
    description: 'TMC5160 stepper driver SPI configuration, currents, and sense resistor.',
    allowsName: true,
    namePrompt: 'stepper_x',
    options: {
      cs_pin: { name: 'cs_pin', type: 'pin', description: 'Chip Select pin for SPI communication.', required: true },
      spi_software_miso_pin: { name: 'spi_software_miso_pin', type: 'pin', description: 'SPI Master In Slave Out pin (shared bus).' },
      spi_software_mosi_pin: { name: 'spi_software_mosi_pin', type: 'pin', description: 'SPI Master Out Slave In pin (shared bus).' },
      spi_software_sclk_pin: { name: 'spi_software_sclk_pin', type: 'pin', description: 'SPI Serial Clock pin (shared bus).' },
      spi_speed: { name: 'spi_speed', type: 'int', description: 'SPI baud rate clock speed (Hz).' },
      spi_bus: { name: 'spi_bus', type: 'string', description: 'Hardware SPI bus name (e.g. spi1, spi2, spi3).' },
      run_current: { name: 'run_current', type: 'float', description: 'Motor run current in Amperes RMS (e.g. 1.7 or 2.4).', required: true },
      hold_current: { name: 'hold_current', type: 'float', description: 'Motor hold current in Amperes RMS.' },
      sense_resistor: { name: 'sense_resistor', type: 'float', description: 'Current sense resistor value in Ohms (typically 0.075 or 0.033).', default: 0.075 },
      stealthchop_threshold: { name: 'stealthchop_threshold', type: 'int', description: 'StealthChop velocity threshold (0 for SpreadCycle, 999999 for always on).', default: 0 },
      interpolate: { name: 'interpolate', type: 'boolean', description: 'Enable 256 microstep interpolation.', default: true },
      diag0_pin: { name: 'diag0_pin', type: 'pin', description: 'MCU pin connected to DIAG0 pin.' },
      diag1_pin: { name: 'diag1_pin', type: 'pin', description: 'MCU pin connected to DIAG1 pin (sensorless homing).' },
      driver_SGT: { name: 'driver_SGT', type: 'int', description: 'StallGuard2 threshold (-64 to 63) for sensorless homing.' },
    },
  },

  tmc2130: {
    name: 'tmc2130',
    description: 'TMC2130 stepper driver SPI configuration.',
    allowsName: true,
    namePrompt: 'stepper_x',
    options: {
      cs_pin: { name: 'cs_pin', type: 'pin', description: 'SPI Chip Select pin.', required: true },
      spi_software_miso_pin: { name: 'spi_software_miso_pin', type: 'pin', description: 'SPI MISO pin (shared).' },
      spi_software_mosi_pin: { name: 'spi_software_mosi_pin', type: 'pin', description: 'SPI MOSI pin (shared).' },
      spi_software_sclk_pin: { name: 'spi_software_sclk_pin', type: 'pin', description: 'SPI SCLK pin (shared).' },
      spi_bus: { name: 'spi_bus', type: 'string', description: 'Hardware SPI bus name.' },
      run_current: { name: 'run_current', type: 'float', description: 'Motor run current in Amperes RMS.', required: true },
      hold_current: { name: 'hold_current', type: 'float', description: 'Motor hold current in Amperes RMS.' },
      sense_resistor: { name: 'sense_resistor', type: 'float', description: 'Sense resistor value in Ohms.', default: 0.110 },
      stealthchop_threshold: { name: 'stealthchop_threshold', type: 'int', description: 'StealthChop threshold.', default: 0 },
      interpolate: { name: 'interpolate', type: 'boolean', description: 'Enable 256 microstep interpolation.', default: true },
      diag1_pin: { name: 'diag1_pin', type: 'pin', description: 'DIAG1 pin for sensorless homing.' },
      driver_SGT: { name: 'driver_SGT', type: 'int', description: 'StallGuard threshold.' },
    },
  },

  tmc2240: {
    name: 'tmc2240',
    description: 'TMC2240 stepper driver SPI configuration.',
    allowsName: true,
    namePrompt: 'stepper_x',
    options: {
      cs_pin: { name: 'cs_pin', type: 'pin', description: 'SPI Chip Select pin.', required: true },
      spi_software_miso_pin: { name: 'spi_software_miso_pin', type: 'pin', description: 'SPI MISO pin (shared).' },
      spi_software_mosi_pin: { name: 'spi_software_mosi_pin', type: 'pin', description: 'SPI MOSI pin (shared).' },
      spi_software_sclk_pin: { name: 'spi_software_sclk_pin', type: 'pin', description: 'SPI SCLK pin (shared).' },
      spi_bus: { name: 'spi_bus', type: 'string', description: 'Hardware SPI bus name.' },
      run_current: { name: 'run_current', type: 'float', description: 'Motor run current.', required: true },
      hold_current: { name: 'hold_current', type: 'float', description: 'Motor hold current.' },
      rref: { name: 'rref', type: 'int', description: 'Reference resistor value in Ohms.', default: 12000 },
      stealthchop_threshold: { name: 'stealthchop_threshold', type: 'int', description: 'StealthChop threshold.', default: 0 },
      interpolate: { name: 'interpolate', type: 'boolean', description: 'Microstep interpolation.', default: true },
      diag0_pin: { name: 'diag0_pin', type: 'pin', description: 'DIAG0 pin.' },
      driver_SGT: { name: 'driver_SGT', type: 'int', description: 'StallGuard threshold.' },
    },
  },

  tmc2208: {
    name: 'tmc2208',
    description: 'TMC2208 stepper driver UART configuration.',
    allowsName: true,
    namePrompt: 'stepper_x',
    options: {
      uart_pin: { name: 'uart_pin', type: 'pin', description: 'UART pin.', required: true },
      tx_pin: { name: 'tx_pin', type: 'pin', description: 'TX pin.' },
      uart_address: { name: 'uart_address', type: 'int', description: 'UART address.' },
      run_current: { name: 'run_current', type: 'float', description: 'Motor run current.', required: true },
      hold_current: { name: 'hold_current', type: 'float', description: 'Motor hold current.' },
      sense_resistor: { name: 'sense_resistor', type: 'float', description: 'Sense resistor.', default: 0.110 },
      stealthchop_threshold: { name: 'stealthchop_threshold', type: 'int', description: 'StealthChop threshold.', default: 0 },
      interpolate: { name: 'interpolate', type: 'boolean', description: 'Microstep interpolation.', default: true },
    },
  },

  safe_z_home: {
    name: 'safe_z_home',
    description: 'Moves toolhead to a safe coordinate (like bed center) before homing the Z axis.',
    allowsName: false,
    options: {
      home_xy_position: { name: 'home_xy_position', type: 'string', description: 'X,Y coordinate where Z homing should occur (e.g. 150, 150).', required: true },
      speed: { name: 'speed', type: 'float', description: 'Speed (mm/s) of the move to home_xy_position.', default: 50.0 },
      z_hop: { name: 'z_hop', type: 'float', description: 'Distance (mm) to lift Z before homing XY.', default: 0.0 },
      z_hop_speed: { name: 'z_hop_speed', type: 'float', description: 'Speed (mm/s) of the Z hop move.', default: 15.0 },
    },
  },

  gcode_macro: {
    name: 'gcode_macro',
    description: 'Custom G-code macro definition with Jinja2 template support.',
    allowsName: true,
    namePrompt: 'MACRO_NAME',
    options: {
      gcode: {
        name: 'gcode',
        type: 'gcode',
        description: 'G-code and Jinja2 script executed when the macro is called.',
        required: true,
      },
      description: {
        name: 'description',
        type: 'string',
        description: 'Short description displayed in Web UI (Mainsail/Fluidd).',
      },
      rename_existing: {
        name: 'rename_existing',
        type: 'string',
        description: 'Rename an existing built-in or custom command so it can be overridden (e.g. M109.1).',
      },
      variable_: {
        name: 'variable_<name>',
        type: 'string',
        description: 'Custom persistent variable accessible via `printer["gcode_macro <name>"].<variable>`.',
      },
    },
  },

  include: {
    name: 'include',
    description: 'Includes another configuration file or glob pattern into the printer configuration.',
    allowsName: true,
    namePrompt: 'filename.cfg',
    options: {},
  },

  tmc2209: {
    name: 'tmc2209',
    description: 'TMC2209 stepper driver UART configuration and sensorless homing settings.',
    allowsName: true,
    namePrompt: 'stepper_x',
    options: {
      uart_pin: { name: 'uart_pin', type: 'pin', description: 'MCU pin connected to TMC UART.', required: true },
      tx_pin: { name: 'tx_pin', type: 'pin', description: 'TX pin if separate TX/RX wiring is used.' },
      uart_address: { name: 'uart_address', type: 'int', description: 'UART address for daisy-chained drivers (0-3).', default: 0 },
      run_current: { name: 'run_current', type: 'float', description: 'Motor run current in Amperes RMS (e.g. 0.800).', required: true },
      hold_current: { name: 'hold_current', type: 'float', description: 'Motor hold current in Amperes RMS.' },
      stealthchop_threshold: { name: 'stealthchop_threshold', type: 'int', description: 'Velocity threshold below which StealthChop is enabled (e.g. 999999 for always on, 0 for SpreadCycle).', default: 0 },
      diag_pin: { name: 'diag_pin', type: 'pin', description: 'MCU pin connected to driver DIAG pin for sensorless homing.' },
      driver_SGTHRS: { name: 'driver_SGTHRS', type: 'int', description: 'StallGuard sensitivity threshold (0-255) for sensorless homing.' },
      interpolate: { name: 'interpolate', type: 'boolean', description: 'Enable 256 microstep interpolation in hardware.', default: true },
    },
  },

  temperature_sensor: {
    name: 'temperature_sensor',
    description: 'Monitors an auxiliary temperature sensor without controlling a heater (e.g. Raspberry Pi, MCU, Chamber).',
    allowsName: true,
    namePrompt: 'sensor_name',
    options: {
      sensor_type: { name: 'sensor_type', type: 'string', description: 'Sensor type (e.g. temperature_mcu, temperature_host, Generic 3950).', required: true },
      sensor_pin: { name: 'sensor_pin', type: 'pin', description: 'ADC pin if using analog thermistor.' },
      min_temp: { name: 'min_temp', type: 'float', description: 'Minimum temperature (°C) for sanity checks.', default: 0.0 },
      max_temp: { name: 'max_temp', type: 'float', description: 'Maximum temperature (°C) for sanity checks.', default: 100.0 },
    },
  },

  virtual_sdcard: {
    name: 'virtual_sdcard',
    description: 'Enables virtual SD card support for printing G-code files from the local filesystem.',
    allowsName: false,
    options: {
      path: { name: 'path', type: 'string', description: 'Local path where G-code files are stored (e.g. ~/printer_data/gcodes).', required: true },
      on_error_gcode: { name: 'on_error_gcode', type: 'gcode', description: 'G-code commands executed if an unhandled error occurs during a print.' },
    },
  },

  pause_resume: {
    name: 'pause_resume',
    description: 'Enables PAUSE and RESUME G-code command handlers with optional parking and retraction settings.',
    allowsName: false,
    options: {
      recover_velocity: { name: 'recover_velocity', type: 'float', description: 'Velocity (mm/s) to return to print position on RESUME.', default: 50.0 },
      xy_speed: { name: 'xy_speed', type: 'float', description: 'XY travel speed (mm/s) for parking toolhead on pause.', default: 300.0 },
      z_speed: { name: 'z_speed', type: 'float', description: 'Z movement speed (mm/s) during pause moves.', default: 15.0 },
      xy_park: { name: 'xy_park', type: 'string', description: 'XY coordinate to park the toolhead on pause (e.g. 10, 10).' },
      z_lift: { name: 'z_lift', type: 'float', description: 'Distance (mm) to lift toolhead Z on pause.', default: 2.0 },
      retract: { name: 'retract', type: 'float', description: 'Filament retract length (mm) on pause.', default: 1.0 },
      retract_speed: { name: 'retract_speed', type: 'float', description: 'Retraction speed (mm/min or mm/s) on pause.', default: 1800.0 },
      unretract: { name: 'unretract', type: 'float', description: 'Filament unretract length (mm) on resume.', default: 1.0 },
      unretract_speed: { name: 'unretract_speed', type: 'float', description: 'Unretract speed on resume.' },
    },
  },

  firmware_retraction: {
    name: 'firmware_retraction',
    description: 'Enables G10 / G11 firmware-level retraction support.',
    allowsName: false,
    options: {
      retract_length: { name: 'retract_length', type: 'float', description: 'Length of filament (mm) to retract.', default: 0.0 },
      retract_speed: { name: 'retract_speed', type: 'float', description: 'Speed of retraction (mm/s).', default: 20.0 },
      unretract_extra_length: { name: 'unretract_extra_length', type: 'float', description: 'Additional filament (mm) to push on unretract.', default: 0.0 },
      unretract_speed: { name: 'unretract_speed', type: 'float', description: 'Speed of unretraction (mm/s).', default: 10.0 },
    },
  },

  idle_timeout: {
    name: 'idle_timeout',
    description: 'Configures printer timeout when idle (turns off heaters and steppers).',
    allowsName: false,
    options: {
      timeout: { name: 'timeout', type: 'int', description: 'Idle timeout in seconds before executing gcode.', default: 600 },
      gcode: { name: 'gcode', type: 'gcode', description: 'G-code to execute when idle timeout is reached.' },
    },
  },

  duplicate_pin_override: {
    name: 'duplicate_pin_override',
    description: 'Allows sharing a microcontroller GPIO pin across multiple config sections.',
    allowsName: false,
    options: {
      pins: { name: 'pins', type: 'string', description: 'Comma-separated list of pins allowed to be shared.', required: true },
    },
  },

  input_shaper: {
    name: 'input_shaper',
    description: 'Resonance compensation algorithms (ZV, MZV, EI, 2HUMP_EI, 3HUMP_EI).',
    allowsName: false,
    options: {
      shaper_freq_x: { name: 'shaper_freq_x', type: 'float', description: 'Frequency (Hz) of the input shaper for X axis.', default: 0.0 },
      shaper_freq_y: { name: 'shaper_freq_y', type: 'float', description: 'Frequency (Hz) of the input shaper for Y axis.', default: 0.0 },
      shaper_type_x: { name: 'shaper_type_x', type: 'choice', choices: ['zv', 'mzv', 'zvd', 'ei', '2hump_ei', '3hump_ei'], description: 'Shaper filter type for X.', default: 'mzv' },
      shaper_type_y: { name: 'shaper_type_y', type: 'choice', choices: ['zv', 'mzv', 'zvd', 'ei', '2hump_ei', '3hump_ei'], description: 'Shaper filter type for Y.', default: 'mzv' },
      damping_ratio_x: { name: 'damping_ratio_x', type: 'float', description: 'Damping ratio for X axis.', default: 0.1 },
      damping_ratio_y: { name: 'damping_ratio_y', type: 'float', description: 'Damping ratio for Y axis.', default: 0.1 },
    },
  },

  save_variables: {
    name: 'save_variables',
    description: 'Enables persistent variable storage in a local file (e.g. variables.cfg).',
    allowsName: false,
    options: {
      filename: { name: 'filename', type: 'string', description: 'Path where variables are stored (e.g. ~/printer_data/config/variables.cfg).', required: true },
    },
  },

  respond: {
    name: 'respond',
    description: 'Enables the RESPOND G-code command for terminal output messages.',
    allowsName: false,
    options: {
      default_type: { name: 'default_type', type: 'choice', choices: ['echo', 'command', 'error'], description: 'Default message type.', default: 'echo' },
      default_prefix: { name: 'default_prefix', type: 'string', description: 'Default prefix string.' },
    },
  },

  display_status: {
    name: 'display_status',
    description: 'Enables M73 and M117 display status updates for Web UIs (Mainsail/Fluidd).',
    allowsName: false,
    options: {},
  },
};

/**
 * Returns list of all known section names for autocomplete
 */
export function getAllSectionNames(): string[] {
  return Object.keys(KLIPPER_SCHEMA);
}

/**
 * Normalizes a section name from a file (e.g. 'stepper_x', 'tmc2209 stepper_x', 'gcode_macro PRINT_START')
 * to its base schema section key (e.g. 'tmc2209', 'gcode_macro', 'stepper_x').
 */
export function getBaseSectionName(rawHeader: string): { base: string; subname?: string } {
  const trimmed = rawHeader.trim();
  const parts = trimmed.split(/\s+/);
  const base = parts[0].toLowerCase();
  const subname = parts.slice(1).join(' ');

  if (KLIPPER_SCHEMA[base]) {
    return { base, subname };
  }

  // Handle stepper_z1, stepper_z2, extruder1, etc.
  if (base.startsWith('stepper_') && KLIPPER_SCHEMA['stepper_z']) {
    return { base: 'stepper_z', subname };
  }

  return { base, subname };
}
