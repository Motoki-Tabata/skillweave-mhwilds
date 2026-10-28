package io.github.motokitabata.skillweave.entity;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

/** 構成の武器（契約の BuildWeapon）。{@code kind} で参照（master）と写し（custom）を判別し、未知の kind は読めない（400）。 */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "kind")
@JsonSubTypes({
    @JsonSubTypes.Type(value = BuildMasterWeapon.class, name = "master"),
    @JsonSubTypes.Type(value = BuildCustomWeapon.class, name = "custom")
})
public sealed interface BuildWeapon permits BuildMasterWeapon, BuildCustomWeapon {}
