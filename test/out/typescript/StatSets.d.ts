interface StatSets {
	/** Unquie identifer for a a set of stats. */
	statSetId : string,
	/** Determines the amount of a hits a unit could take before perishing. */
	health : number,
	/** Determines how hard a unit hits, will be reduced by the attacked units armor. */
	attack : number,
	/** Determines how much damage is mitigated in an attack on this unit. */
	armor : number,
}
