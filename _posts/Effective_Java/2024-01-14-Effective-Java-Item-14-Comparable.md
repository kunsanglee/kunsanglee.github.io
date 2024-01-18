---
title: "Effective Java - 아이템 14: Comparable을 구현할지 고려하라"
categories:
  - Effective Java
tags:
  - Effective Java
toc: true
toc_sticky: true
toc_label: ""
toc_icon: ""
---

### compareTo
Comparable 인터페이스의 유일한 메서드인 compareTo는 단순 동치성 비교에 더해 순서까지 비교할 수 있으며, 제네릭하다.<br>
Comparable을 구현했다는 것은 그 클래스의 인스턴스들에는 자연적인 순서(natural order)가 있음을 뜻한다.

사실상 자바 플랫폼 라이브러리의 모든 값 클래스와 열거타입이 Comparable을 구현했다.<br>
알파벳, 숫자, 연대 같이 순서가 명확한 값 클래스를 작성한다면 반드시 Comparable 인터페이스를 구현하자.

```java
public interface Comparable<T> {
    int compareTo(T t);
}
```

### compareTo 메서드의 일반 규약
>compareTo 메서드의 일반 규약은 equals의 규약과 비슷하다.<br>
이 객체와 주어진 객체의 순서를 비교한다. 이 객체가 주어진 객체보다 작으면 음수를, 같으면 0, 크면 양수를 반환한다.<br>
이 객체와 비교할 수 없는 타입의 객체가 주어지면 ClassCastException을 던진다.<br>
compareTo 메서드로 수행하는 동치성 검사도 equals 규약과 똑같이 반사성, 대칭성, 추이성을 충족해야 함을 뜻한다.

equals와 마찬가지로 기존 클래스를 확장한 구체 클래스에서 새로운 값 컴포넌트를 추가했다면 compareTo 규약을 지킬 방법이 없다.
Comparable을 구현한 클래스를 확장해 값 컴포넌트를 추가하고 싶다면,
확장하는 대신 독립된 클래스를 만들고 이 클래스에 원래 클래스의 인스턴스를 가리키는 필드를 두자.<br>

compareTo 메서드로 수행한 동치성 테스트의 결과가 equals와 같아야 한다.<br>
즉 compareTo 반환값이 0이면, equals 비교가 true가 나와야 한다.

컬렉션이 구현한 인터페이스(Collection, Set, Map)들은 equals 메서드의 규약을 따른다고 되어있지만,<br>
정렬된 컬렉션(SortedSet, TreeSet 등)은 동치성을 비교할 때 equals 대신 compareTo를 사용한다.

### compareTo와 equals의 차이점
Comparable은 타입을 인수로 받는 제네릭 인터페이스이므로 compareTo 메서드의 인수 타입은 컴파일타임에 정해진다.<br> 
입력 인수의 타입을 확인하거나 형변환할 필요가 없다는 뜻이다.<br>

compareTo 메서드는 각 필드가 동치인지를 비교하는 게 아니라 그 순서를 비교한다.
객체 참조 필드를 비교하려면 compareTo 메서드를 재귀적으로 호출한다.<br> 
Comparable을 구현하지 않은 필드나 표준이 아닌 순서로 비교해야 한다면 비교자(Comparator)를 대신 사용한다.<br>

compareTo 메서드에서 정수 기본 타입 필드를 비교할 때 박싱된 기본 타입 클래스들에 새로 추가된 정적 메서드 compare를 사용해라.

### 비교
클래스에 핵심 필드가 여러 개라면 가장 핵심적인 필드부터 비교해나가자.<br>
비교 결과가 0이 아니라면, 즉 순서가 결정되면 거기서 끝이다. 바로 결과를 반환하자.

```java
// 기본 타입 필드가 여럿일 때의 비교자
public int compareTo(PhoneNumber pn) {
    int result = Short.compare(areaCode, pn.areaCode); // 가장 중요한 필드
    if (result == 0) {
        result = Short.compare(prefix, pn.prefix); // 두 번째로 중요한 필드
        if (result == 0) {
            result = Short.compare(lineNum, pn.lineNum); // 세 번째로 중요한 필드
        }
    }
    return result;
}
```

### 핵심 정리
순서를 고려해야 하는 값 클래스(래퍼 클래스)를 작성한다면 꼭 Comparable 인터페이스를 구현하여,<br> 
그 인스턴스들을 쉽게 정렬하고, 검색하고, 비교 기능을 제공하는 컬렉션과 어우러지도록 해야 한다.
