public class StatSet {
	/// <summary>Unquie identifer for a a set of stats.
	public string statSetId;
	/// <summary>Determines the amount of a hits a unit could take before perishing.
	public int health;
	/// <summary>Determines how hard a unit hits, will be reduced by the attacked units armor.
	public int attack;
	/// <summary>Determines how much damage is mitigated in an attack on this unit.
	public int armor;
}
