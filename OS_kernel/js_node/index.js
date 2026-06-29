/**
 * ------------------------------------------------------------
 * Copyright (C) 2024  Agentix Team
 *
 * This program is free software: you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation, either version 3 of
 * the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 * ------------------------------------------------------------
 */

/**
 * ============================================================
 * Agentix OS Kernel — index.js  [Node.js Edition]
 * Central entry point — exports all public modules
 * ============================================================
 * Usage:
 *   const AgentixOS = require('./OS_kernel/js_node');
 *   const { AgentixKernel, TensionEngine, ... } = AgentixOS;
 *
 * NOTE: IntentAnchoring (module 10) is a paid module.
 *       It is not included in this open-source distribution.
 *       See: https://agentix.dev/modules for licensing.
 * ============================================================
 */

'use strict';

const { Vector, Semantic, AgentixKernel } = require('./corekernel.js');
const { TensionEngine }                   = require('./tension_engine.js');
const { SpatialMapping }                  = require('./spatial_mapping.js');
const { TemporalDynamics }                = require('./temporal_dynamics.js');
const { HierarchicalHolarchy }            = require('./hierarchical_holarchy.js');
const { EvolutionCalibration }            = require('./evolution_calibration.js');
const { CommunicationInterface }          = require('./communication.js');
const { ComplianceHealing }               = require('./compliance_healing.js');
const { MetabolismResource }              = require('./metabolism_resource.js');
const { MemoryCondensation }              = require('./memory_condensation.js');

module.exports = {
    // Core primitives
    Vector,
    Semantic,
    AgentixKernel,

    // Layer modules (open-source, GPLv3)
    TensionEngine,
    SpatialMapping,
    TemporalDynamics,
    HierarchicalHolarchy,
    EvolutionCalibration,
    CommunicationInterface,
    ComplianceHealing,
    MetabolismResource,
    MemoryCondensation,
};
