package io.github.motokitabata.skillweave.entity;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

/**
 * 構成の護石（契約の BuildPayload.charm の null 以外）。鑑定護石の形（{@code id}・{@code payload}）と生産護石の形（{@code kind}・{@code charmId}）を、
 * 項目の有無から判別する。どちらにも当てはまらない値は読めない（400）。
 */
@JsonTypeInfo(use = JsonTypeInfo.Id.DEDUCTION)
@JsonSubTypes({@JsonSubTypes.Type(BuildCharm.class), @JsonSubTypes.Type(BuildCraftedCharm.class)})
public sealed interface BuildPayloadCharm permits BuildCharm, BuildCraftedCharm {}
