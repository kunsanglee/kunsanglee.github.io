---
title: "Effective Java - 아이템 11: equals를 재정의하려거든 hashCode도 재정의하라"
categories:
  - Effective Java
tags:
  - Effective Java
toc: true
toc_sticky: true
toc_label: ""
toc_icon: ""
---

### equals를 재정의한 클래스 모두에서 hashCode도 재정의해야 한다
재정의하지 않으면 일반 규약을 어기게 되어 HashMap, HashSet 같은 컬렉션의 원소로 사용할 때 문제를 일으킬 것이다.

### Object 명세
1. equals 비교에 사용되는 정보가 변경되지 않았다면, 애플리케이션이 실행되는 동안 그 객체의 hashCode 메서드는 몇 번을 호출해도 일관되게 항상 같은 값을 반환해야 한다. 단, 애플리케이션을 다시 실행한다면 이 값이 달라져도 상관없다.
2. equals(Object)가 두 객체를 같다고 판단했다면, 두 객체의 hashCode는 똑같은 값을 반환해야 한다. 
3. equals(Object)가 두 객체를 다르다고 판단했더라도, 두 객체의 hashCode가 서로 다른 값을 반환할 필요는 없다. 단, 다른 객체에 대해서는 다른 값을 반환해야 해시테이블의 성능이 좋아진다.

equals는 물리적으로 다른 두 객체를 논리적으로 같다고 할 수 있지만, Object의 기본 hashCode 메서드는 두 객체가 전혀 다르다고 판단하여,
규약과 달리 서로 다른 값을 반환한다.
```java
Map<PhoneNumber, String> m = new HashMap<>();
m.put(new PhoneNumber(707, 867, 5309), "제니"));

String s = m.get(new PhoneNumber(707, 867, 5309));

s.equals("제니"); // false. s == null
```
위 코드에서 `Map`에 저장할 때, 꺼낼 때 2개의 `PhoneNumber` 인스턴스가 사용되었다. `PhoneNumber` 클래스는 `hashCode`를 재정의하지 않았기 때문에 논리적 동치인 두 객체가 서로 다른 해시코드를 반환하여 두 번째 규약을 지키지 못한다.<br>
그 결과 `get` 메서드는 엉뚱한 해시 버킷에 가서 객체를 찾고, 설사 같은 버킷에서 찾더라도 여전히 `null`을 반환한다.<br>
이유는 `HashMap`은 해시코드가 다른 엔트리끼리는 동치성 비교를 시도조차 하지 않도록 최적화되어 있기 때문이다.<br>
이 문제를 해결하려면 `PhoneNumber` 클래스에 `hashCode` 메서드만 작성해주면 해결된다.

```java
// 최악의 hashCode 구현
@Override public int hashCode() { return 42; }
```

`hashCode` 메서드에서 모든 객체에 42라는 동일한 값을 반환하므로 해시테이블이 버킷 하나에 담겨<br>
마치 `LinkedList`처럼 동작한다. 그 결과 평균 수행 시간이 O(1)인 해시테이블이 O(n)으로 느려진다.<br>
**좋은 해시 함수라면 서로 다른 인스턴스에 다른 해시코드를 반환한다.**<br>

### equals 비교에 사용되지 않는 필드는 반드시 제외해야 한다
그렇지 않으면 hashCode 규약 두 번째(equals(Object)가 두 객체를 같다고 판단했다면, 두 객체의 hashCode는 똑같은 값을 반환해야 한다)를 어기게 될 위험이 있다.<br>

```java
@Override public int hashCode() {
    int result = Short.hashCode(areaCode);
    result = 31 * Short.hashCode(prefix); // 31을 곱해주는 이유는 31이 홀수이면서 소수이기 때문이다. 2를 곱하는 것은 시프트 연산과 같은 결과를 낸다.
    result = 31 * Short.hashCode(lineNum); // 곱하는 수가 짝수이고 오버플로가 발생한다면 정보를 잃게 된다.
    return result;
}
```

Object 클래스는 임의의 개수만큼 객체를 받아 해시코드를 계산해주는 정적 메서드인 hash를 제공한다.<br>
이 메서드를 활용하면 hashCode를 단 한 줄로 작성할 수 있지만, 속도는 더 느리다.<br>
입력 인수를 담기 위한 배열이 만들어지고, 입력 중 기본 타입이 있다면 박싱과 언박싱도 거쳐야 하기 때문이다.

```java
@Override public int hashCode() {
    return Object.hash(lineNum, prefix, areaCode);
}
```

**위 코드는 해시값은 바뀌지 않는데 해시 함수를 호출할 때 마다 매번 다시 계산하는 것이 비효율적인 점이다.**<br>
클래스가 불변이고 해시코들르 계산하는 비용이 크다면, 매번 새로 계산하기 보다는 캐싱하는 방식을 고려해야 한다.<br>
이 타입의 객체가 주로 해시의 키로 사용될 것 같다면 인스턴스가 만들어질 때 해시코드를 계산해둬야 한다.<br>
해시의 키로 사용되지 않는 경우라면 hashCode가 처음 불릴 때 계산하는 지연 초기화(lazy initialization) 전략을 사용할 수 있다.

```java
// 해시코드를 지연 초기화하는 hashCode 메서드
private int hashCode;

@Override public int hashCode() {
    int result = hashCode;
    if (result == 0) { // hashCdoe가 초기화되지 않은 경우 해시코드 계산
        result = Short.hashCode(areaCode);
        result = 31 * Short.hashCode(prefix);
        result = 31 * Short.hashCode(lineNum);
        hashCode = result;
    }
    return result; // hashCode가 계산되어 있다면 바로 반환.
}
```

### 성능을 높인다고 해시코드를 계산할 때 핵심 필드를 생략해서는 안 된다
속도는 빨라지겠지만, 해시 품질이 나빠져 해시테이블의 성능을 심각하게 떨어뜨릴 수도 있다.<br>
핵심 필드를 생략한다면 해당 영역의 수많은 인스턴스가 단 몇개의 해시코드로 집중되어 해시테이블의 속도가 선형으로 느려질 것이다.<br>

### hashCode가 반환하는 값의 생성 규칙을 API 사용자에게 자세히 공표하지 말자
그래야 클라이언트가 이 값에 의지하지 않게 되고, 추후에 계산 방식을 변경할 수 있다.<br>
자세한 규칙을 공표하지 않는다면, 해시 기능에서 결함을 발견했거나 더 나은 해시 방식을 알아낸 경우 다음 릴리스에서 수정할 수 있다.<br>

> 이 책에서 반복적으로 말하는 것 중에 하나는, 의도치 않게 public API가 되는 상황을 조심하라는 것이다.<br>
> 이유는 public API가 되어버린 순간부터 영원히 해당 public API를 지원해야 하고, 변경 또한 어렵게 되기 때문이다.

### 핵심 정리
**`equals`를 재정의할 때는 `hashCode`도 반드시 재정의해야 한다.**<br>
재정의한 `hashCode`는 `Object`의 API 문서에 기술된 일반 규약을 따라야 하며,<br> 
서로 다른 인스턴스라면 되도록 해시코드도 서로 다르게 구현해야 한다.
